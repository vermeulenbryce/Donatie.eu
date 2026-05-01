import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { CauseQuizAnswersV1 } from '../legacy/causeMatchQuizLogic'

export type UserCauseQuizRow = {
  user_id: string
  completed_at: string
  answers: CauseQuizAnswersV1
  ranked_cause_ids: number[]
  primary_filter: string
}

function parseRow(x: Record<string, unknown> | null): UserCauseQuizRow | null {
  if (!x) return null
  const a = x.answers
  return {
    user_id: String(x.user_id ?? ''),
    completed_at: String(x.completed_at ?? ''),
    answers: (typeof a === 'object' && a && 'v' in a
      ? a
      : {
          v: 1 as const,
          themeOrder: [],
          impact: 'europa',
          orgStyle: 'bekend',
          motivation: 'structuur',
        }) as CauseQuizAnswersV1,
    ranked_cause_ids: Array.isArray(x.ranked_cause_ids) ? (x.ranked_cause_ids as number[]) : [],
    primary_filter: String(x.primary_filter ?? 'alle'),
  }
}

export async function fetchMyCauseQuiz(userId: string): Promise<UserCauseQuizRow | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('user_cause_quiz')
    .select('user_id, completed_at, answers, ranked_cause_ids, primary_filter')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) return null
    throw new Error(error.message)
  }
  return parseRow((data ?? null) as Record<string, unknown> | null)
}

export async function insertUserCauseQuiz(input: {
  userId: string
  answers: CauseQuizAnswersV1
  rankedCauseIds: number[]
  primaryFilter: string
}): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Niet ingelogd of geen database.')
  }
  const { error } = await supabase.from('user_cause_quiz').insert({
    user_id: input.userId,
    answers: input.answers,
    ranked_cause_ids: input.rankedCauseIds,
    primary_filter: input.primaryFilter,
  })
  if (error) {
    if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate') || error.message?.includes('unique')) {
      throw new Error('Je hebt de quiz al een keer gedaan.')
    }
    throw new Error(error.message)
  }
}

export function useMyCauseQuiz(userId: string | null) {
  const [row, setRow] = useState<UserCauseQuizRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!userId) {
      setRow(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const r = await fetchMyCauseQuiz(userId)
      setRow(r)
    } catch (e) {
      setRow(null)
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { row, loading, error: err, refetch, completed: !!row }
}
