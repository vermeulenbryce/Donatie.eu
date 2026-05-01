import { supabase } from '../../lib/supabase'
import type { Project } from '../../types/domain'

export async function fetchProjectsByOwner(ownerId: string): Promise<Project[]> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Projecten ophalen mislukt: ${error.message}`)
  }

  return (data ?? []).map(normalizeProjectRow)
}

export async function createProject(input: {
  ownerId: string
  title: string
  description?: string
  targetAmount?: number
}): Promise<Project> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: input.ownerId,
      name: input.title,
      description: input.description ?? null,
      goal: input.targetAmount ?? 0,
      status: 'actief',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Project aanmaken mislukt: ${error?.message ?? 'Onbekende fout'}`)
  }

  return normalizeProjectRow(data)
}

export function normalizeProjectRow(row: Record<string, unknown>): Project {
  return {
    id: String(row.id ?? ''),
    owner_id: String(row.owner_id ?? ''),
    title: String(row.title ?? row.name ?? 'Onbekend project'),
    description: (row.description as string | null | undefined) ?? null,
    target_amount: Number(row.target_amount ?? row.goal ?? 0),
    status: (String(row.status ?? 'draft') as Project['status']) ?? 'draft',
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: (row.updated_at as string | null | undefined) ?? null,
    community_id: (row.community_id as string | null | undefined) ?? null,
    charity_cause_key: (row.charity_cause_key as string | null | undefined) ?? null,
    visibility: (row.visibility as Project['visibility']) ?? undefined,
    image_url: (row.image_url as string | null | undefined) ?? null,
  }
}
