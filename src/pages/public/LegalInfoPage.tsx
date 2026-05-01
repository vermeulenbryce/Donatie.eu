import { Link } from 'react-router-dom'
import { useLiveLegalBlock } from '../../features/public/legalLive'

export function LegalInfoPage({ title }: { title: string }) {
  const content = useLiveLegalBlock(title)

  return (
    <main role="main" id="mainContent">
      <div className="page active" style={{ minHeight: 'calc(100vh - var(--nav-h))' }}>
        <div className="container section-sm" style={{ maxWidth: 860 }}>
          <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 16, padding: 24 }}>
            <h1
              style={{
                fontFamily: 'Fraunces,serif',
                fontSize: '1.8rem',
                fontWeight: 900,
                color: '#1a237e',
                marginBottom: 10,
              }}
            >
              {title}
            </h1>
            <p style={{ color: 'var(--mid)', lineHeight: 1.7, marginBottom: 16 }}>{content.intro}</p>
            <ul style={{ color: 'var(--mid)', lineHeight: 1.7, paddingLeft: 18 }}>
              {content.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p style={{ color: 'var(--mid)', lineHeight: 1.7, marginTop: 14 }}>
              Voor directe vragen: <a href="mailto:info@donatie.eu">info@donatie.eu</a>.
            </p>
            <div style={{ marginTop: 18 }}>
              <Link to="/" className="btn btn-dark btn-sm">
                ← Terug naar home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
