import { useCallback, useEffect, useState } from 'react'
import { CBF_CAUSES } from '../../features/legacy/cbfCauses.generated'
import { adminGetUserCauseQuizJson } from '../../features/admin/adminContentService'
import { sectorMeta } from '../../features/legacy/legacySectorMeta'

type Props = {
  userId: string | null
  onClose: () => void
}

function nameForCause(id: number): string {
  return CBF_CAUSES.find((c) => c.id === id)?.naam ?? `Doel #${id}`
}

export function AdminUserCauseQuizPanel({ userId, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<Record<string, unknown> | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setErr(null)
    try {
      const j = await adminGetUserCauseQuizJson(userId)
      setData(j && Object.keys(j).length ? j : null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onK = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onK)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onK)
    }
  }, [onClose])

  if (!userId) return null

  const ranked = Array.isArray(data?.ranked_cause_ids) ? (data.ranked_cause_ids as number[]) : []
  const answers = data?.answers as Record<string, unknown> | undefined
  const completed = typeof data?.completed_at === 'string' ? data.completed_at : null
  const filter = typeof data?.primary_filter === 'string' ? data.primary_filter : '—'

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,.45)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="admin-portal-card"
        style={{ maxWidth: 520, width: '100%', maxHeight: '85vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
          <h3 className="admin-portal-card-title" style={{ margin: 0 }}>
            Quiz-uitslag
          </h3>
          <button type="button" className="admin-portal-btn is-ghost" onClick={onClose} aria-label="Sluiten">
            Sluiten
          </button>
        </div>
        {loading ? <p>Bezig met laden…</p> : null}
        {err ? (
          <p style={{ color: '#b91c1c' }}>
            {err}
            {err.includes('function') && err.includes('admin_get_user_cause_quiz') ? (
              <span>
                {' '}
                Voer <code>docs/SQL_USER_CAUSE_QUIZ.sql</code> uit.
              </span>
            ) : null}
          </p>
        ) : null}
        {!loading && !err && !data ? <p>Geen quiz-uitslag (gebruiker heeft de quiz niet gedaan).</p> : null}
        {data && !loading && !err ? (
          <div>
            <p className="admin-portal-card-sub" style={{ marginTop: 0 }}>
              <strong>Voltooid</strong> {completed ? new Date(completed).toLocaleString('nl-NL') : '—'} · filter:{' '}
              <code>{filter}</code>
            </p>
            {answers && typeof answers === 'object' ? (
              <pre
                style={{
                  fontSize: 11,
                  background: 'var(--admin-muted, #f3f4f6)',
                  padding: 10,
                  borderRadius: 8,
                  overflow: 'auto',
                  maxHeight: 140,
                }}
              >
                {JSON.stringify(answers, null, 2)}
              </pre>
            ) : null}
            <h4 style={{ fontSize: '0.9rem', margin: '12px 0 8px' }}>Top {ranked.length} (volgorde)</h4>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.88rem' }}>
              {ranked.map((id, i) => {
                const c = CBF_CAUSES.find((x) => x.id === id)
                const m = c ? sectorMeta(c.sector) : null
                return (
                  <li key={id} style={{ marginBottom: 6 }}>
                    <strong>#{i + 1}</strong> {nameForCause(id)}
                    {c && m ? (
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#6b7280' }}>· {m.label}</span>
                    ) : null}
                  </li>
                )
              })}
            </ol>
            <p className="admin-portal-card-sub" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
              Gebruik in marketing: filter “Gebruikers per quiz-doen” bij Goede doelen beheer, of toekomstige push naar
              segment.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
