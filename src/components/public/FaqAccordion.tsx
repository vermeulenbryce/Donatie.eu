import { useId, useState } from 'react'

type Item = { q: string; a: string }

export function FaqAccordion({ items }: { items: Item[] }) {
  const baseId = useId()
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => {
        const isOpen = open === i
        const panelId = `${baseId}-panel-${i}`
        const headerId = `${baseId}-header-${i}`
        return (
          <div key={item.q} className="faq-item" style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <button
              type="button"
              id={headerId}
              className="faq-q"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : i)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '18px 20px',
                fontWeight: 800,
                fontSize: '.9rem',
                color: 'var(--dark)',
                cursor: 'pointer',
              }}
            >
              <span>{item.q}</span>
              <span aria-hidden style={{ fontSize: '1.1rem', color: 'var(--mid)', transition: 'transform .2s ease', transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>
                {isOpen ? '−' : '+'}
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              className="faq-a"
              style={{
                display: 'grid',
                gridTemplateRows: isOpen ? '1fr' : '0fr',
                transition: 'grid-template-rows .28s ease',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                <div style={{ padding: '0 20px 18px', fontSize: '.88rem', color: 'var(--mid)', lineHeight: 1.7 }}>
                  {item.a}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
