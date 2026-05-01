import { supabase } from '../lib/supabase'

export type ProfileIndividu = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  account_type: 'individu'
  anonymous: boolean | null
  points: number | null
  total_donated: number | null
}

export type ProfileBedrijf = {
  id: string
  email: string | null
  first_name: string | null
  company_name: string | null
  kvk: string | null
  contact_name: string | null
  points: number | null
  total_donated: number | null
  updated_at: string | null
}

export type ProfileInfluencer = {
  id: string
  email: string | null
  first_name: string | null
  influencer_name: string | null
  niche: string | null
  points: number | null
  total_donated: number | null
  updated_at: string | null
}

export type ProfileCount = {
  account_type: 'individu' | 'bedrijf' | 'influencer'
  totaal: number
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is nog niet geconfigureerd.')
  return supabase
}

export async function fetchIndividuen() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('v_profiles_individu')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data as ProfileIndividu[]
}

export async function fetchBedrijven() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('v_profiles_bedrijf')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data as ProfileBedrijf[]
}

export async function fetchInfluencers() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('v_profiles_influencer')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data as ProfileInfluencer[]
}

export async function fetchProfileCounts() {
  const client = requireSupabase()
  const { data, error } = await client.from('v_profile_counts').select('*')

  if (error) throw new Error(error.message)
  return data as ProfileCount[]
}
