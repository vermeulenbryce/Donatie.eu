export type ProjectStatus = 'draft' | 'active' | 'actief' | 'verlopen' | 'cancelled'

export interface Project {
  id: string
  owner_id: string
  title: string
  description: string | null
  target_amount: number | null
  status: ProjectStatus
  created_at: string
  updated_at: string | null
  /** Supabase community-projecten */
  community_id?: string | null
  charity_cause_key?: string | null
  visibility?: 'public' | 'members_only'
  /** Optionele afbeelding (dataURL of http URL) */
  image_url?: string | null
}

export type DonationStatus = 'pending' | 'paid' | 'cancelled' | 'refunded' | 'switched'

export interface Donation {
  id: string
  donor_id: string | null
  donor_email: string | null
  donor_name: string | null
  project_id: string | null
  charity_name: string | null
  amount: number
  amount_to_charity: number | null
  amount_retained: number | null
  status: DonationStatus
  payment_method: string | null
  type: string | null
  mollie_payment_id: string | null
  checkout_url: string | null
  paid_at: string | null
  refunded_at: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}
