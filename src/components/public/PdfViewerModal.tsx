import { useEffect, useRef, useState } from 'react'

type PdfViewerModalProps = {
  open: boolean
  title: string
  url: string
  onClose: () => void
}

function buildIframeSrc(rawUrl: string): { src: string; blobUrl: string | null } {
  if (!rawUrl) return { src: '', blobUrl: null }
  if (rawUrl.startsWith('data:application/pdf')) {
    try {
      const comma = rawUrl.indexOf(',')
      const b64 = rawUrl.slice(comma + 1)
      const byteStr = atob(b64)
      const arr = new Uint8Array(byteStr.length)
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
      const blob = new Blob([arr], { type: 'application/pdf' })
      const blobUrl = URL.createObjectURL(blob)
      return { src: `${blobUrl}#toolbar=0&navpanes=0&scrollbar=1`, blobUrl }
    } catch {
      return { src: rawUrl, blobUrl: null }
    }
  }
  const suffix = rawUrl.includes('?') ? '&' : '#'
  return { src: `${rawUrl}${suffix}toolbar=0&navpanes=0&scrollbar=1`, blobUrl: null }
}

/** Same behavior as legacy `openPdfViewer` / modal in `index.html`. */
export function PdfViewerModal({ open, title, url, onClose }: PdfViewerModalProps) {
  const [iframeSrc, setIframeSrc] = useState('')
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !url) {
      setIframeSrc('')
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      return
    }

    const { src, blobUrl } = buildIframeSrc(url)
    if (blobUrl) blobUrlRef.current = blobUrl
    setIframeSrc(src)

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [open, url])

  const handleClose = () => {
    setIframeSrc('')
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    onClose()
  }

  if (!open) return null

  return (
    <div
      id="pdfViewerModal"
      style={{
        display: 'flex',
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.75)',
        zIndex: 3000,
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdfViewerTitle"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 860,
          width: '100%',
          height: 'calc(100vh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid #e5e7eb',
            flexShrink: 0,
          }}
        >
          <div
            id="pdfViewerTitle"
            style={{
              fontFamily: 'Fraunces, serif',
              fontSize: '1rem',
              fontWeight: 800,
              color: '#1f2937',
            }}
          >
            {title || 'Document'}
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: '#f3f4f6',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '.88rem',
              color: '#6b7280',
            }}
          >
            ✕ Sluiten
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {iframeSrc ? (
            <iframe
              title={title || 'PDF'}
              id="pdfViewerFrame"
              src={iframeSrc}
              style={{ width: '100%', height: '100%', border: 'none' }}
              sandbox="allow-same-origin allow-scripts"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
