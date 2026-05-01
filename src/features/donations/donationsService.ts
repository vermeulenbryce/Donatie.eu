import { supabase } from '../../lib/supabase'
import type { Donation } from '../../types/domain'
import {
  computeDonorPointsPreviewSync,
  getDonationAmountsSync,
  preloadDonationSiteSettings,
} from './donationSiteSettings'

export async function fetchRecentDonations(limit = 20): Promise<Donation[]> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Donaties ophalen mislukt: ${error.message}`)
  }

  return (data ?? []).map(normalizeDonation)
}

export async function createDonation(input: {
  donorUserId: string
  donorEmail?: string
  donorName?: string
  charityName?: string
  amount: number
  type?: 'eenmalig' | 'maandelijks'
  /** Community-/projectdonatie: koppelt aan project + Mollie-flow */
  projectId?: string | null
  charityCauseKey?: string | null
}): Promise<Donation> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  /** Community-projecten: uitsluitend eenmalig (productregel + voorkomt verkeerde Mollie-flow). */
  const hasProject = Boolean(input.projectId && String(input.projectId).trim().length > 0)
  const donationType: 'eenmalig' | 'maandelijks' = hasProject ? 'eenmalig' : (input.type ?? 'eenmalig')
  await validateMinimumAmount(input.amount, donationType)
  const pointsEligibleAt = computePointsEligibleAt(donationType)

  const ptsPreview = computeDonorPointsPreviewSync(input.amount)
  const { data, error } = await supabase
    .from('donations')
    .insert({
      donor_user_id: input.donorUserId,
      type: donationType,
      donor_name: input.donorName ?? null,
      donor_email: input.donorEmail ?? null,
      charity_name: input.charityName ?? 'Onbekend',
      amount: input.amount,
      project_id: input.projectId ?? null,
      points_value: ptsPreview,
      payment_method: 'mollie_pending',
      status: 'pending',
      refunded_at: null,
      notes: null,
      metadata: {
        donation_type: donationType,
        points_status: 'pending',
        points_eligible_at: pointsEligibleAt,
        ...(input.charityCauseKey ? { charity_cause_key: input.charityCauseKey } : {}),
        ...(input.projectId ? { project_id: input.projectId } : {}),
      },
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Donatie aanmaken mislukt: ${error?.message ?? 'Onbekende fout'}`)
  }

  return normalizeDonation(data)
}

export async function markDonationAsPaid(donationId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { error } = await supabase
    .from('donations')
    .update({
      status: 'paid',
    })
    .eq('id', donationId)

  if (error) {
    throw new Error(`Donatie status update mislukt: ${error.message}`)
  }
}

export interface MollieCheckoutContractResult {
  provider: 'mollie'
  donationId: string
  checkoutUrl: string | null
  molliePaymentId: string | null
  mode: 'live' | 'pending_contract'
  message: string
}

export async function initiateMollieCheckoutContract(input: {
  donationId: string
  amount: number
  donorEmail?: string
  donorName?: string
  charityName?: string
  donationType?: 'eenmalig' | 'maandelijks'
}): Promise<MollieCheckoutContractResult> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const body = {
    donationId: input.donationId,
    amount: input.amount,
    donorEmail: input.donorEmail ?? null,
    donorName: input.donorName ?? null,
    charityName: input.charityName ?? null,
    donationType: input.donationType ?? 'eenmalig',
  }

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  // Gebruik altijd de anon key voor deze call. Een (verlopen) user-JWT geeft vaak HTTP 401 op de gateway.
  const functionAuthHeaders =
    anonKey != null && anonKey.length > 0 ? { Authorization: `Bearer ${anonKey}` } : undefined

  try {
    const { data, error } = await supabase.functions.invoke('create-mollie-payment', {
      body,
      headers: functionAuthHeaders,
    })

    if (!error && data) {
      const payload = data as Record<string, unknown>
      const mode: MollieCheckoutContractResult['mode'] =
        payload.mode === 'live' ? 'live' : 'pending_contract'
      return {
        provider: 'mollie',
        donationId: input.donationId,
        checkoutUrl: (payload.checkoutUrl as string | undefined) ?? null,
        molliePaymentId: (payload.molliePaymentId as string | undefined) ?? null,
        mode,
        message:
          (typeof payload.message === 'string' && payload.message) ||
          (mode === 'live' ? 'Mollie checkout initialized.' : 'Donatie blijft pending.'),
      }
    }
  } catch {
    // fall through to fetch fallback
  }

  const fallback = await invokeCreateMolliePaymentViaFetch(body)
  if (fallback) return fallback

  return {
    provider: 'mollie',
    donationId: input.donationId,
    checkoutUrl: null,
    molliePaymentId: null,
    mode: 'pending_contract',
    message: 'Mollie endpoint niet bereikbaar (invoke + fetch). Donatie blijft pending.',
  }
}

async function invokeCreateMolliePaymentViaFetch(body: Record<string, unknown>) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!baseUrl || !anonKey || !supabase) return null

  try {
    const response = await fetch(`${baseUrl}/functions/v1/create-mollie-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()
    let payload: Record<string, unknown> = {}
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      payload = {}
    }

    if (!response.ok) {
      return {
        provider: 'mollie' as const,
        donationId: String(body.donationId),
        checkoutUrl: null,
        molliePaymentId: null,
        mode: 'pending_contract' as const,
        message: `Mollie function HTTP ${response.status}. Donatie blijft pending.`,
      }
    }

    const mode: MollieCheckoutContractResult['mode'] =
      payload.mode === 'live' ? 'live' : 'pending_contract'
    return {
      provider: 'mollie' as const,
      donationId: String(body.donationId),
      checkoutUrl: (payload.checkoutUrl as string | undefined) ?? null,
      molliePaymentId: (payload.molliePaymentId as string | undefined) ?? null,
      mode,
      message:
        (typeof payload.message === 'string' && payload.message) ||
        (mode === 'live' ? 'Mollie checkout initialized.' : 'Donatie blijft pending.'),
    }
  } catch {
    return null
  }
}

export async function attachMollieCheckoutInfo(input: {
  donationId: string
  molliePaymentId?: string | null
  checkoutUrl?: string | null
}): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { data: existing, error: loadError } = await supabase
    .from('donations')
    .select('metadata')
    .eq('id', input.donationId)
    .single()

  if (loadError) {
    throw new Error(`Ophalen huidige metadata mislukt: ${loadError.message}`)
  }

  const metadata = {
    ...(((existing?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>),
    mollie_payment_id: input.molliePaymentId ?? null,
    checkout_url: input.checkoutUrl ?? null,
  }

  const { error } = await supabase
    .from('donations')
    .update({
      payment_method: 'mollie',
      metadata,
    })
    .eq('id', input.donationId)

  if (error) {
    throw new Error(`Opslaan Mollie checkout info mislukt: ${error.message}`)
  }
}

export function getMollieIntegrationStatus() {
  return {
    provider: 'mollie',
    connected: false,
    message:
      'Zet MOLLIE_API_KEY + SITE_URL in Supabase Edge secrets en deploy create-mollie-payment + mollie-webhook.',
  }
}

function normalizeDonation(row: Record<string, unknown>): Donation {
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? null
  const projectFromMeta =
    typeof meta?.project_id === 'string' ? meta.project_id : (row.project_id as string | null | undefined) ?? null
  return {
    id: String(row.id ?? ''),
    donor_id:
      (row.donor_user_id as string | null | undefined) ??
      (row.donor_id as string | null | undefined) ??
      null,
    donor_email: readMetadataString(row.metadata, 'donor_email'),
    donor_name: readMetadataString(row.metadata, 'donor_name'),
    project_id: projectFromMeta,
    charity_name:
      (row.charity_name as string | null | undefined) ??
      (row.notes as string | null | undefined) ??
      readMetadataString(row.metadata, 'charity_name'),
    amount: Number(row.amount ?? 0),
    amount_to_charity: toNullableNumber(row.amount_to_charity),
    amount_retained: toNullableNumber(row.amount_retained),
    status: (String(row.status ?? 'pending') as Donation['status']) ?? 'pending',
    payment_method: (row.payment_method as string | null | undefined) ?? null,
    type: readMetadataString(row.metadata, 'donation_type') ?? null,
    mollie_payment_id: readMetadataString(row.metadata, 'mollie_payment_id'),
    checkout_url: readMetadataString(row.metadata, 'checkout_url'),
    paid_at: null,
    refunded_at: (row.refunded_at as string | null | undefined) ?? null,
    notes: (row.notes as string | null | undefined) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  }
}

function readMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const asNumber = Number(value)
  return Number.isFinite(asNumber) ? asNumber : null
}

async function validateMinimumAmount(amount: number, type: 'eenmalig' | 'maandelijks') {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Donatiebedrag moet groter zijn dan 0.')
  }

  await preloadDonationSiteSettings()
  const cfg = getDonationAmountsSync()
  const minimum = type === 'maandelijks' ? cfg.maandelijks_min : cfg.eenmalig_min
  if (amount < minimum) {
    throw new Error(
      type === 'maandelijks'
        ? `Minimaal bedrag voor maandelijks is ${cfg.maandelijks_min} euro.`
        : `Minimaal bedrag voor eenmalig is ${cfg.eenmalig_min} euro.`,
    )
  }
}

function computePointsEligibleAt(type: 'eenmalig' | 'maandelijks'): string {
  const now = new Date()
  if (type === 'maandelijks') {
    now.setDate(now.getDate() + 60)
  } else {
    now.setHours(now.getHours() + 72)
  }
  return now.toISOString()
}
