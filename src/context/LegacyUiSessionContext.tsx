import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  authStateChangedEvent,
  logoutCurrentUser,
  restoreAuthenticatedUser,
} from '../features/auth/authService'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { LocalUser } from '../types/auth'
import type { LegacyDonateFreq } from '../features/legacy/legacyCbfConstants'
import {
  appendDonationToDnlAccounts,
  dnlAccountsUpdatedEvent,
  mergeSessionUserIntoDnlAccounts,
  readDnlAccounts,
  upsertDnlAccountProfile,
  upsertLeaderboardAccountFromShell,
} from '../features/account/legacyDashboardModel'

const DEMO_STORAGE_KEY = 'dnl_legacy_demo'

export type LegacyPreviewDonation = {
  cause: string
  org: string
  amount: number
  pts: number
  date: string
}

export type LegacyShellUser = {
  source: 'demo' | 'session'
  user: LocalUser | null
  displayName: string
  firstName: string
  lastName: string
  email: string
  points: number
  /** Punten die alleen in community-puntenwinkels gebruikt kunnen worden */
  communityPoints: number
  avatarLetter: string
  /** Profielfoto (dataURL of http URL); alleen voor niet-anonieme gebruikers zichtbaar elders. */
  avatarUrl?: string | null
  totalDonated: number
  anonymous: boolean
  /** Demo-only: matches `doVoorbeeldProfiel` in index.html */
  yearDonated?: number
  previewDonations?: LegacyPreviewDonation[]
}

function buildShellFromLocalUser(u: LocalUser): LegacyShellUser {
  const displayName = `${u.firstName} ${u.lastName}`.trim() || u.email
  const initial = (u.firstName?.[0] || u.email?.[0] || '?').toUpperCase()
  const shell: LegacyShellUser = {
    source: 'session',
    user: u,
    displayName,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    points: u.points,
    communityPoints: u.communityPoints ?? 0,
    avatarLetter: initial,
    avatarUrl: u.avatarUrl ?? null,
    totalDonated: u.totalDonated,
    anonymous: u.anonymous,
  }
  mergeSessionUserIntoDnlAccounts(shell)
  return shell
}

function buildDemoShell(): LegacyShellUser {
  return {
    source: 'demo',
    user: null,
    displayName: 'Voorbeeld Profiel',
    firstName: 'Voorbeeld',
    lastName: 'Profiel',
    email: 'voorbeeld@donatie.nl',
    points: 340,
    communityPoints: 0,
    avatarLetter: 'V',
    totalDonated: 280,
    anonymous: false,
    yearDonated: 280,
    previewDonations: [
      { cause: 'KWF', org: 'KWF', amount: 150, pts: 75, date: '08-03-2026' },
      { cause: 'Rode Kruis', org: 'Rode Kruis', amount: 130, pts: 65, date: '01-03-2026' },
    ],
  }
}

type LegacyUiSessionContextValue = {
  shell: LegacyShellUser | null
  isPreview: boolean
  enterDemoMode: () => void
  exitPreview: () => void
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  /** Matches `confirmDonation` shell updates in legacy index (lokaal, geen provider-call). */
  recordLegacyDonation: (input: {
    amount: number
    pts: number
    causeTitle: string
    org: string
    frequency?: LegacyDonateFreq
  }) => void
  /** Lokale profielsync voor dashboard-acties (legacy parity). */
  updateShellProfile: (input: {
    firstName?: string
    lastName?: string
    anonymous?: boolean
  }) => void
}

const defaultLegacyUiSessionContext: LegacyUiSessionContextValue = {
  shell: null,
  isPreview: false,
  enterDemoMode: () => {
    /* no-op fallback */
  },
  exitPreview: () => {
    /* no-op fallback */
  },
  logout: async () => {
    /* no-op fallback */
  },
  refreshSession: async () => {
    /* no-op fallback */
  },
  recordLegacyDonation: () => {
    /* no-op fallback */
  },
  updateShellProfile: () => {
    /* no-op fallback */
  },
}

const LegacyUiSessionContext = createContext<LegacyUiSessionContextValue>(defaultLegacyUiSessionContext)

export function LegacyUiSessionProvider({ children }: { children: ReactNode }) {
  const [shell, setShell] = useState<LegacyShellUser | null>(null)

  const readDemoFromStorage = useCallback(() => {
    try {
      return sessionStorage.getItem(DEMO_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  }, [])

  const refreshSession = useCallback(async () => {
    if (readDemoFromStorage()) {
      const demo = buildDemoShell()
      upsertLeaderboardAccountFromShell(demo)
      setShell(demo)
      return
    }
    if (!isSupabaseConfigured) {
      setShell(null)
      return
    }
    try {
      const u = await restoreAuthenticatedUser()
      setShell(u ? buildShellFromLocalUser(u) : null)
    } catch {
      setShell(null)
    }
  }, [readDemoFromStorage])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshSession()
    }, 0)
    return () => window.clearTimeout(t)
  }, [refreshSession])

  /**
   * E-mailbevestiging/magic links (zeker mobiel): `detectSessionInUrl` zet sessie vaak ná de eerste tick.
   * Dan was `restoreAuthenticatedUser()` al met null gedraaid zonder verwijzing-claim (+ pending points).
   * Herbij op `INITIAL_SESSION` / `SIGNED_IN` hetzelfde pad als na wachtwoordlogin.
   */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    const client = supabase
    const { data: sub } = client.auth.onAuthStateChange((event, sess) => {
      if (!sess?.user || (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN')) return
      void refreshSession()
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [refreshSession])

  useEffect(() => {
    const onAuth = (ev: Event) => {
      const ce = ev as CustomEvent<LocalUser | null>
      const u = ce.detail
      if (u) {
        try {
          sessionStorage.removeItem(DEMO_STORAGE_KEY)
        } catch {
          /* ignore */
        }
        setShell(buildShellFromLocalUser(u))
      } else {
        void refreshSession()
      }
    }
    window.addEventListener(authStateChangedEvent, onAuth as EventListener)
    return () => window.removeEventListener(authStateChangedEvent, onAuth as EventListener)
  }, [refreshSession])

  /** Live punten / profiel uit Supabase wanneer de rij in `profiles` wijzigt (webhooks, triggers, andere tab). */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    const client = supabase
    if (shell?.source !== 'session' || !shell.user?.id) return

    const userId = shell.user.id
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        void refreshSession()
      }, 450)
    }

    const channel = client
      .channel(`shell-profile-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        scheduleRefresh,
      )
      .subscribe()

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      void client.removeChannel(channel)
    }
  }, [shell?.source, shell?.user?.id, refreshSession])

  useEffect(() => {
    const syncFromAccounts = () => {
      setShell((prev) => {
        if (!prev) return prev
        if (prev.source === 'demo') return prev
        const stored = readDnlAccounts()[prev.email] || {}
        const firstName = String(stored.firstName ?? prev.firstName)
        const lastName = String(stored.lastName ?? prev.lastName)
        const points = Number(stored.points ?? prev.points)
        const totalDonated = Number(stored.totalDonated ?? prev.totalDonated)
        const anonymous = Boolean(stored.anonymous ?? prev.anonymous)
        return {
          ...prev,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`.trim() || prev.email,
          avatarLetter: (firstName[0] || prev.avatarLetter || '?').toUpperCase(),
          points,
          totalDonated,
          anonymous,
          user: prev.user
            ? {
                ...prev.user,
                firstName,
                lastName,
                points,
                totalDonated,
                anonymous,
              }
            : prev.user,
        }
      })
    }
    window.addEventListener(dnlAccountsUpdatedEvent, syncFromAccounts)
    return () => window.removeEventListener(dnlAccountsUpdatedEvent, syncFromAccounts)
  }, [])

  const enterDemoMode = useCallback(() => {
    try {
      sessionStorage.setItem(DEMO_STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    const demo = buildDemoShell()
    upsertLeaderboardAccountFromShell(demo)
    setShell(demo)
  }, [])

  const exitPreview = useCallback(() => {
    try {
      sessionStorage.removeItem(DEMO_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setShell(null)
  }, [])

  const logout = useCallback(async () => {
    if (shell?.source === 'demo') {
      exitPreview()
      return
    }
    if (isSupabaseConfigured) {
      await logoutCurrentUser()
    }
    setShell(null)
  }, [exitPreview, shell?.source])

  const recordLegacyDonation = useCallback(
    (input: { amount: number; pts: number; causeTitle: string; org: string; frequency?: LegacyDonateFreq }) => {
      setShell((prev) => {
        if (!prev) return prev
        const date = new Date().toISOString().slice(0, 10)
        const monthly = input.frequency === 'maandelijks'
        const row: LegacyPreviewDonation = {
          cause: input.causeTitle,
          org: input.org,
          amount: input.amount,
          pts: input.pts,
          date,
        }
        const next: LegacyShellUser = {
          ...prev,
          points: prev.points + input.pts,
          totalDonated: prev.totalDonated + input.amount,
          yearDonated: (prev.yearDonated ?? 0) + input.amount,
          previewDonations: [...(prev.previewDonations ?? []), row],
        }
        appendDonationToDnlAccounts(
          prev.email,
          { ...row, monthly },
          {
            points: next.points,
            totalDonated: next.totalDonated,
            firstName: next.firstName,
            lastName: next.lastName,
            anonymous: next.anonymous,
          },
          prev.previewDonations,
        )
        return next
      })
    },
    [],
  )

  const updateShellProfile = useCallback(
    (input: { firstName?: string; lastName?: string; anonymous?: boolean }) => {
      setShell((prev) => {
        if (!prev) return prev
        const firstName = (input.firstName ?? prev.firstName).trim() || prev.firstName
        const lastName = (input.lastName ?? prev.lastName).trim()
        const anonymous = input.anonymous ?? prev.anonymous
        const displayName = `${firstName} ${lastName}`.trim() || prev.email
        const next: LegacyShellUser = {
          ...prev,
          firstName,
          lastName,
          anonymous,
          displayName,
          avatarLetter: (firstName[0] || prev.avatarLetter || '?').toUpperCase(),
        }
        if (next.source === 'session' && next.user) {
          next.user = {
            ...next.user,
            firstName: next.firstName,
            lastName: next.lastName,
            anonymous: next.anonymous,
          }
        }
        upsertDnlAccountProfile(prev.email, {
          firstName: next.firstName,
          lastName: next.lastName,
          anonymous: next.anonymous,
        })
        return next
      })
    },
    [],
  )

  const value = useMemo(
    () => ({
      shell,
      isPreview: shell?.source === 'demo',
      enterDemoMode,
      exitPreview,
      logout,
      refreshSession,
      recordLegacyDonation,
      updateShellProfile,
    }),
    [enterDemoMode, exitPreview, logout, recordLegacyDonation, refreshSession, shell, updateShellProfile],
  )

  return <LegacyUiSessionContext.Provider value={value}>{children}</LegacyUiSessionContext.Provider>
}

/** @see https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports */
// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider (legacy shell)
export function useLegacyUiSession() {
  return useContext(LegacyUiSessionContext)
}
