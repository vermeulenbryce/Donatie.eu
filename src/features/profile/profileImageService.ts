import { supabase } from '../../lib/supabase'

/** Resize een image-file in de browser en geef een base64 jpeg terug. */
export async function fileToResizedDataUrl(
  file: File,
  opts: { maxSide?: number; quality?: number } = {},
): Promise<string> {
  const maxSide = opts.maxSide ?? 1024
  const quality = opts.quality ?? 0.85

  if (!file.type.startsWith('image/')) {
    throw new Error('Kies een afbeelding (jpg, png, webp).')
  }

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) {
    // fallback: gewoon de file als dataURL teruggeven
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onerror = () => reject(new Error('Kan bestand niet lezen.'))
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '')
      fr.readAsDataURL(file)
    })
  }

  const { width: w0, height: h0 } = bitmap
  const scale = Math.min(1, maxSide / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas niet beschikbaar.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  const mime = 'image/jpeg'
  return canvas.toDataURL(mime, quality)
}

function parseRpcJsonRecord(data: unknown): Record<string, unknown> {
  if (data == null) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return {}
}

export async function updateMyAvatar(avatarDataUrl: string | null): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')

  // Probeer eerst de RPC (schoonste pad)
  const { data, error } = await supabase.rpc('update_my_avatar', { p_avatar_url: avatarDataUrl })
  if (!error) {
    const payload = parseRpcJsonRecord(data)
    if (payload.ok === true) return
    // Niet-ok antwoord → foutmelding
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Opslaan mislukt.')
  }

  // RPC niet gevonden of andere infra-fout → fallback via directe update
  const msg = error.message || ''
  const isMissingRpc = /Could not find the function|not exist|function .* does not exist/i.test(msg)
  if (!isMissingRpc) {
    throw new Error(msg)
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user?.id) {
    throw new Error('Je sessie is verlopen. Log opnieuw in.')
  }
  const { error: updErr } = await supabase
    .from('profiles')
    .update({
      avatar_url: avatarDataUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userData.user.id)
  if (updErr) {
    throw new Error(
      `Profielfoto kon niet opgeslagen worden: ${updErr.message}. Voer in Supabase het bijgewerkte SQL-blok uit.`,
    )
  }
}

export type PublicProfileInfo = {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  anonymous: boolean
}

export async function getPublicProfileInfo(userIds: string[]): Promise<PublicProfileInfo[]> {
  if (!supabase || userIds.length === 0) return []
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  const { data, error } = await supabase.rpc('get_public_profile_info', { p_user_ids: uniqueIds })
  if (error) return []
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
  return rows.map((r) => ({
    id: String(r.id ?? ''),
    first_name: typeof r.first_name === 'string' ? r.first_name : null,
    last_name: typeof r.last_name === 'string' ? r.last_name : null,
    avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
    anonymous: r.anonymous === true,
  }))
}
