import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import {
  fetchUserSiteNotifications,
  markUserNotificationReadServer,
  readLocalUserNotifReadIds,
  SITE_INBOX_NOTIFICATION_TYPES,
  type UserSiteNotificationRow,
  writeLocalUserNotifReadIds,
} from '../../features/public/userSiteNotifications'
import { SiteNotificationDetailModal } from './SiteNotificationDetailModal'

type PushRow = UserSiteNotificationRow

export function PushInbox() {
  const { shell } = useLegacyUiSession()
  const userId = shell?.user?.id ?? null
  const [rows, setRows] = useState<PushRow[]>([])
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(() => readLocalUserNotifReadIds())
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelLayout, setPanelLayout] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const [detailRow, setDetailRow] = useState<UserSiteNotificationRow | null>(null)

  const load = useCallback(async () => {
    if (!userId) {
      setRows([])
      return
    }
    const list = await fetchUserSiteNotifications(userId, SITE_INBOX_NOTIFICATION_TYPES)
    setRows(list ?? [])
  }, [userId])

  useEffect(() => {
    void load()
    if (!userId) return
    const pollInterval = window.setInterval(load, 15_000)
    if (!isSupabaseConfigured || !supabase) {
      return () => window.clearInterval(pollInterval)
    }
    const client = supabase
    const channel = client
      .channel(`public-inbox-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_notifications' }, () => {
        void load()
      })
      .subscribe()
    return () => {
      window.clearInterval(pollInterval)
      try {
        void client.removeChannel(channel)
      } catch {
        /* ignore */
      }
    }
  }, [userId, load])

  const positionPanel = useCallback(() => {
    const btn = triggerRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const vw = window.innerWidth
    const margin = 12
    const panelW = Math.min(340, vw - margin * 2)
    const top = r.bottom + 8
    const maxH = Math.max(160, Math.min(440, window.innerHeight - top - margin))
    /* Lijn rechts uit met de trigger; klemmen zodat niets links/rechts uitsteekt (mobiel + tablet). */
    let left = r.right - panelW
    left = Math.max(margin, Math.min(left, vw - panelW - margin))
    setPanelLayout({ top, left, width: panelW, maxHeight: maxH })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPanelLayout(null)
      return
    }
    positionPanel()
  }, [open, positionPanel])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      if (t instanceof Element && t.closest('.site-notif-detail-backdrop')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (detailRow) return
      setOpen(false)
    }
    const onWin = () => positionPanel()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open, positionPanel, detailRow])

  const unreadCount = useMemo(
    () => rows.filter((r) => !r.read_at && !readIds.has(r.id)).length,
    [rows, readIds],
  )

  function markRead(id: string) {
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      writeLocalUserNotifReadIds(next)
      return next
    })
    void markUserNotificationReadServer(id)
  }

  function markAllRead() {
    const next = new Set(readIds)
    for (const r of rows) {
      next.add(r.id)
      void markUserNotificationReadServer(r.id)
    }
    setReadIds(next)
    writeLocalUserNotifReadIds(next)
  }

  if (!userId) return null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Berichten${unreadCount > 0 ? ` (${unreadCount} ongelezen)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative',
          width: 38,
          height: 38,
          borderRadius: 9999,
          border: '1.5px solid rgba(255,255,255,.25)',
          background: 'rgba(255,255,255,.12)',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '1.05rem',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        🔔
        {unreadCount > 0 ? (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 9999,
              background: '#dc2626',
              color: '#fff',
              fontSize: '.65rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 2px #1a237e',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open && panelLayout
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Meldingen"
              style={{
                position: 'fixed',
                top: panelLayout.top,
                left: panelLayout.left,
                width: panelLayout.width,
                maxHeight: panelLayout.maxHeight,
                boxSizing: 'border-box',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 14,
                boxShadow: '0 12px 30px rgba(0,0,0,.18)',
                overflow: 'hidden',
                zIndex: 99999,
                color: '#111827',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderBottom: '1px solid #f3f4f6',
                  flexShrink: 0,
                }}
              >
                <strong style={{ fontFamily: 'Fraunces,serif', fontSize: '.95rem', color: '#1a237e' }}>
                  Meldingen
                </strong>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={markAllRead}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#3a98f8',
                      fontSize: '.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Alles gelezen
                  </button>
                ) : null}
              </div>
              <p
                style={{
                  padding: '6px 14px 8px',
                  margin: 0,
                  fontSize: '.72rem',
                  color: '#94a3b8',
                  lineHeight: 1.35,
                  borderBottom: '1px solid #f3f4f6',
                  flexShrink: 0,
                }}
              >
                Tik op een bericht om het volledig te lezen.
              </p>
              <div style={{ maxHeight: Math.max(100, panelLayout.maxHeight - 80), overflowY: 'auto' }}>
                {rows.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', color: '#6b7280', fontSize: '.88rem' }}>
                    Geen berichten.
                  </div>
                ) : (
                  rows.map((r) => {
                    const isUnread = !r.read_at && !readIds.has(r.id)
                    const typeLabel =
                      r.type === 'melding' ? 'Melding' : r.type === 'push' ? 'Push' : r.type === 'actie' ? 'Actie' : r.type
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-label={`Bericht openen: ${r.title}`}
                        onClick={() => {
                          markRead(r.id)
                          setDetailRow(r)
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '12px 14px',
                          border: 'none',
                          borderBottom: '1px solid #f3f4f6',
                          background: isUnread ? '#eff6ff' : '#f3f4f6',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          opacity: isUnread ? 1 : 0.96,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div
                            style={{
                              fontSize: '1.1rem',
                              flexShrink: 0,
                              filter: isUnread ? undefined : 'grayscale(0.35)',
                              opacity: isUnread ? 1 : 0.85,
                            }}
                          >
                            {r.icon ?? (r.type === 'melding' ? '📋' : '📣')}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: isUnread ? '#64748b' : '#94a3b8',
                                marginBottom: 2,
                              }}
                            >
                              {typeLabel}
                              {!isUnread ? ' · gelezen' : ''}
                            </div>
                            <div
                              style={{
                                fontWeight: isUnread ? 800 : 500,
                                fontSize: '.88rem',
                                color: isUnread ? '#1a237e' : '#6b7280',
                              }}
                            >
                              {r.title}
                            </div>
                            {r.body ? (
                              <div
                                className="site-notif-list-body-preview"
                                style={{
                                  fontSize: '.82rem',
                                  color: isUnread ? '#4b5563' : '#94a3b8',
                                  marginTop: 2,
                                }}
                              >
                                {r.body}
                              </div>
                            ) : null}
                            <div style={{ fontSize: '.7rem', color: '#9ca3af', marginTop: 4 }}>
                              {new Date(r.created_at).toLocaleString('nl-NL')}
                              {r.target_user_id == null ? ' · broadcast' : ''}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      <SiteNotificationDetailModal notification={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  )
}
