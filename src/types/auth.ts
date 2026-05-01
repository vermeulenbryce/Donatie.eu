export type AccountType = 'individu' | 'bedrijf' | 'influencer'

export interface Profile {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  account_type: AccountType | null
  anonymous: boolean | null
  points: number | null
  total_donated: number | null
  community_points?: number | null
  address?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string | null
  avatar_url?: string | null
  /** Unieke verwijzerscode uit Supabase (`profiles.referral_my_code`). */
  referral_my_code?: string | null
}

export interface LocalUser {
  id: string
  email: string
  firstName: string
  lastName: string
  type: AccountType
  anonymous: boolean
  points: number
  totalDonated: number
  communityPoints: number
  avatarUrl?: string | null
  address?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  /** Eigen referralcode uit database (kopie/link delen); alleen gevuld bij Supabase-sessie. */
  referralMyCode?: string | null
}
