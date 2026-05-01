export const dnlProjectsUpdatedEvent = 'dnl:projects-updated'
export const dnlCommunitiesUpdatedEvent = 'dnl:communities-updated'

export type LegacyStoredProject = {
  id: string
  title: string
  name?: string
  raised: number
  goal: number
  donors: number
  ownerEmail?: string
  category?: string
  desc?: string
  deadline?: string
  createdAt?: string
  /** Optionele projectfoto (dataURL of http URL) */
  imageUrl?: string
}

export type LegacyStoredCommunity = {
  id: string
  name: string
  title?: string
  influencerEmail?: string
  _owner?: string
  members?: string[]
  donations?: Array<{ amount?: number }>
  totalRaised?: number
  createdAt?: string
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readLegacyProjects(): LegacyStoredProject[] {
  const rows = readJson<unknown>('dnl_projects', [])
  return Array.isArray(rows) ? (rows as LegacyStoredProject[]) : []
}

export function writeLegacyProjects(rows: LegacyStoredProject[]) {
  localStorage.setItem('dnl_projects', JSON.stringify(rows))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(dnlProjectsUpdatedEvent))
  }
}

export function readLegacyCommunities(): LegacyStoredCommunity[] {
  const rows = readJson<unknown>('dnl_communities', [])
  return Array.isArray(rows) ? (rows as LegacyStoredCommunity[]) : []
}

export function writeLegacyCommunities(rows: LegacyStoredCommunity[]) {
  localStorage.setItem('dnl_communities', JSON.stringify(rows))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(dnlCommunitiesUpdatedEvent))
  }
}

