import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAdminSessionOk } from './adminSession'

export function AdminPortalPage() {
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!isAdminSessionOk()) {
      navigate('/admin/login', { replace: true })
    }
  }, [navigate])

  function syncLegacyAdminPage() {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    const win = iframe.contentWindow as typeof window & {
      adminState?: { loggedIn?: boolean }
      showPage?: (page: string, skipHistory?: boolean) => void
      hideAdminLogin?: () => void
      renderAdminDashboard?: () => void
    }

    try {
      if (!win.adminState) return
      win.adminState.loggedIn = true
      win.hideAdminLogin?.()
      win.showPage?.('admin', true)
      win.renderAdminDashboard?.()
    } catch {
      // keep silent; iframe keeps default legacy behavior
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: '#0f172a',
      }}
    >
      <iframe
        ref={iframeRef}
        src="/legacy-admin-index.html"
        title="Legacy Admin Panel"
        onLoad={() => {
          syncLegacyAdminPage()
          window.setTimeout(syncLegacyAdminPage, 250)
        }}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: '#fff',
        }}
      />
    </div>
  )
}
