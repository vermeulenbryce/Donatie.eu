import { isSupabaseConfigured, supabase } from '../../lib/supabase'

const MODERATION_ERR_NL =
  'Deze afbeelding wordt niet geaccepteerd: hij kan onveilige of ongepaste inhoud bevatten. Kies een andere foto.'

/**
 * Server-side Azure Content Safety via Edge Function `analyze-image-safety`.
 * Platformbeheerders (profiles.is_admin of app_metadata.role=admin) slaan de check over op de server.
 *
 * Zonder gedeployde function of zonder Azure-keys op de server: geen blokkade (zelfde als
 * `{ ok: true, skipped: "not_configured" }` in de function).
 *
 * Om échte moderatie in productie: deploy `supabase/functions/analyze-image-safety` en zet optioneel
 * Azure-secrets in Supabase → Edge Functions (zie .env.example).
 */
export async function assertUserImagePassesAzureModeration(imageDataUrl: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean
    skipped?: string
    bypass?: string
    reason?: string
  }>('analyze-image-safety', {
    body: { imageBase64: imageDataUrl },
  })

  if (error) {
    // Geen Supabase Edge Function gedeployd, of netwerk: upload niet blokkeren (geen AI-check).
    console.warn('[azureImageModeration] analyze-image-safety niet bereikbaar — moderatie overgeslagen:', error.message)
    return
  }

  const payload = data ?? {}
  if (payload.ok === true) return
  if (payload.reason === 'content_policy') {
    throw new Error(MODERATION_ERR_NL)
  }
  throw new Error('Afbeelding werd geweigerd door de beveiligingscontrole.')
}
