import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FOOTER_PAGE_HREF, type FooterLink } from '../../features/public/footerLegacyData'
import { useLiveFooterData } from '../../features/public/footerLive'
import { PdfViewerModal } from './PdfViewerModal'
import type { LegacyShellUser } from '../../context/LegacyUiSessionContext'
import { useLiveBrandingSettings } from '../../features/public/brandingLive'

type PublicSiteFooterProps = {
  shell: LegacyShellUser | null
}

function FooterLinkRow({
  lnk,
  onPdf,
  onPlaceholder,
}: {
  lnk: FooterLink
  onPdf: (url: string, label: string) => void
  onPlaceholder: () => void
}) {
  const pdfFallbackPath: Record<string, string> = {
    privacybeleid: '/juridisch/privacybeleid',
    'algemene voorwaarden': '/juridisch/algemene-voorwaarden',
    'anbi-info': '/juridisch/anbi-info',
    transparantie: '/juridisch/transparantie',
    'anti-fraude beleid': '/juridisch/anti-fraude-beleid',
    cookieverklaring: '/juridisch/cookieverklaring',
    gegevensverwerking: '/juridisch/gegevensverwerking',
    'avg / gdpr': '/juridisch/avg-gdpr',
    'recht op inzage': '/juridisch/recht-op-inzage',
  }

  if (!lnk.label) return null

  const pdfBadge =
    lnk.type === 'pdf' ? (
      <span
        style={{
          fontSize: '.65rem',
          background: 'rgba(255,255,255,.12)',
          borderRadius: 3,
          padding: '1px 5px',
          marginLeft: 4,
        }}
      >
        PDF
      </span>
    ) : null

  if (lnk.type === 'page') {
    const href = FOOTER_PAGE_HREF[lnk.target] ?? '#'
    return (
      <Link
        to={href}
        onClick={(e) => {
          if (href === '#') e.preventDefault()
        }}
        style={{ cursor: 'pointer' }}
      >
        {lnk.label}
        {pdfBadge}
      </Link>
    )
  }

  if (lnk.type === 'url' && lnk.target) {
    return (
      <a
        href={lnk.target}
        onClick={(e) => {
          e.preventDefault()
          window.open(lnk.target, '_blank', 'noopener,noreferrer')
        }}
        style={{ cursor: 'pointer' }}
      >
        {lnk.label}
        {pdfBadge}
      </a>
    )
  }

  if (lnk.type === 'pdf') {
    if (lnk.target) {
      return (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            onPdf(lnk.target, lnk.label || 'Document')
          }}
          style={{ cursor: 'pointer' }}
        >
          {lnk.label}
          {pdfBadge}
        </a>
      )
    }
    const key = (lnk.label || '').trim().toLowerCase()
    const fallback = pdfFallbackPath[key]
    if (fallback) {
      return (
        <Link to={fallback} style={{ cursor: 'pointer' }}>
          {lnk.label}
          {pdfBadge}
        </Link>
      )
    }
    return (
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault()
          onPlaceholder()
        }}
        style={{ cursor: 'pointer' }}
      >
        {lnk.label}
        {pdfBadge}
      </a>
    )
  }

  return null
}

export function PublicSiteFooter({ shell }: PublicSiteFooterProps) {
  const branding = useLiveBrandingSettings()
  const data = useLiveFooterData()
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfTitle, setPdfTitle] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(t)
  }, [toast])

  const showFooterAdmin =
    Boolean(shell?.email && shell.email.toLowerCase() === 'admin@donatie.eu')

  const cols = useMemo(() => data.cols ?? [], [data.cols])
  const badges = useMemo(() => data.badges ?? [], [data.badges])

  const openPdf = useCallback((url: string, title: string) => {
    setPdfTitle(title)
    setPdfUrl(url)
    setPdfOpen(true)
  }, [])

  const placeholder = useCallback(() => {
    setToast('📄 Document volgt binnenkort.')
  }, [])

  return (
    <>
      <footer className="site-footer" id="siteFooter" role="contentinfo" aria-label="Sitenavigatie en informatie">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <div className="footer-logo">
                <div className="logo-heart" style={{ width: 28, height: 28 }} aria-hidden>
                  <img
                    src={branding.logoFooterUrl || branding.logoNavUrl || '/logo-nav.jpg'}
                    alt=""
                    width={28}
                    height={28}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                    onError={(e) => {
                      const el = e.currentTarget
                      if (el.dataset.fallback === '1') return
                      el.dataset.fallback = '1'
                      el.src = '/donatie-logo.svg'
                    }}
                  />
                </div>
                Donatie.eu
              </div>
              <p>{data.desc}</p>
            </div>
            <div id="footerDynamicCols" style={{ display: 'contents' }}>
              {cols.map((col, i) => (
                <div className="footer-col" key={`${col.title}-${i}`}>
                  <h4>{col.title}</h4>
                  {(col.links ?? []).map((lnk, j) => (
                    <FooterLinkRow
                      key={`${col.title}-${i}-${j}-${lnk.label}`}
                      lnk={lnk}
                      onPdf={openPdf}
                      onPlaceholder={placeholder}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="footer-bottom">
            <p>{data.copyright}</p>
            <div className="footer-trust">
              {badges.map((b, i) => (
                <div className="trust-badge" key={`${b}-${i}`}>
                  {b}
                </div>
              ))}
              {showFooterAdmin ? (
                <Link
                  id="footerAdminBtn"
                  to="/admin/login"
                  className="trust-badge"
                  style={{
                    display: 'inline-block',
                    cursor: 'pointer',
                    opacity: 0.9,
                    fontSize: '.75rem',
                    background: 'rgba(255,255,255,.15)',
                    border: '1px solid rgba(255,255,255,.3)',
                    padding: '4px 12px',
                    borderRadius: 6,
                    color: '#fff',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                  title="Beheerderstoegang"
                >
                  ⚙️ Admin
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </footer>

      <PdfViewerModal
        open={pdfOpen}
        title={pdfTitle}
        url={pdfUrl}
        onClose={() => {
          setPdfOpen(false)
          setPdfUrl('')
        }}
      />

      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 88,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 4000,
            background: '#1f2937',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: '.88rem',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,.2)',
            maxWidth: 'min(420px, 92vw)',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      ) : null}
    </>
  )
}
