import { createPortal } from 'react-dom'
import { useEffect, useId, useRef } from 'react'
import { linkifyPlainText } from '../../lib/linkifyPlainText'
import type { UserSiteNotificationRow } from '../../features/public/userSiteNotifications'

function typeLabelFor(r: UserSiteNotificationRow): string {
  if (r.type === 'melding') return 'Melding'
  if (r.type === 'push') return 'Push'
  if (r.type === 'actie') return 'Actie'
  return r.type
}

export function SiteNotificationDetailModal({
  notification,
  onClose,
}: {
  notification: UserSiteNotificationRow | null
  onClose: () => void
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!notification) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => closeBtnRef.current?.focus(), 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [notification, onClose])

  if (!notification) return null

  const label = typeLabelFor(notification)
  const isBroadcast = notification.target_user_id == null

  return createPortal(
    <div
      className="site-notif-detail-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="site-notif-detail-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="site-notif-detail-panel__top">
          <div className="site-notif-detail-panel__meta">
            <span className="site-notif-detail-panel__chip">{label}</span>
            {isBroadcast ? <span className="site-notif-detail-panel__chip site-notif-detail-panel__chip--broadcast">iedereen</span> : null}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="site-notif-detail-panel__close"
            aria-label="Sluiten"
            onClick={onClose}
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        <div className="site-notif-detail-panel__icon" aria-hidden>
          {notification.icon ?? (notification.type === 'melding' ? '📋' : '📣')}
        </div>

        <h2 id={titleId} className="site-notif-detail-panel__title">
          {notification.title}
        </h2>

        <div className="site-notif-detail-panel__scroll">
          {notification.body ? (
            <div className="site-notif-detail-panel__body">{linkifyPlainText(notification.body)}</div>
          ) : (
            <p className="site-notif-detail-panel__empty">Geen extra tekst bij dit bericht.</p>
          )}
        </div>

        <div className="site-notif-detail-panel__footer">
          <time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString('nl-NL')}</time>
        </div>
      </div>
    </div>,
    document.body,
  )
}
