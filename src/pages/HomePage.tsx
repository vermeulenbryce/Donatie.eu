import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'

/** Interne hub tijdens migratie (vroeger de placeholder-home). Publieke site staat op `/`. */
export function HomePage() {
  const status = useMemo(() => {
    return isSupabaseConfigured ? 'Verbonden (config gevonden)' : 'Nog niet geconfigureerd'
  }, [])

  return (
    <main className="app-shell">
      <header>
        <h1>Platform-hub (migratie)</h1>
        <p>
          De publieke Donatie.eu-site staat op <Link to="/">de homepagina</Link>. Deze pagina bundelt de technische
          modules.
        </p>
      </header>

      <section className="card">
        <h2>Modules</h2>
        <p>
          <Link to="/auth">Auth</Link>
        </p>
        <p>
          <Link to="/profiles-overview">Profielen</Link>
        </p>
        <p>
          <Link to="/framework-status">Frameworkstatus</Link>
        </p>
        <p>
          <Link to="/projects">Projecten</Link>
        </p>
        <p>
          <Link to="/donations">Donaties</Link>
        </p>
      </section>

      <section className="card">
        <h2>Supabase</h2>
        <p>{status}</p>
        <p className="hint">Vul `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` in `.env.local` om live te testen.</p>
      </section>

      <section className="card">
        <Link to="/">← Terug naar Donatie.eu home</Link>
      </section>
    </main>
  )
}
