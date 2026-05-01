import { Link } from 'react-router-dom'

export function FrameworkStatusPage() {
  return (
    <main className="app-shell">
      <header>
        <h1>Framework structuur status</h1>
        <p>Overzicht van wat al in React + Vite staat en wat nog uit legacy gemigreerd moet worden.</p>
      </header>

      <section className="card">
        <h2>Al gemigreerd</h2>
        <ul>
          <li>App routing en pagina-structuur</li>
          <li>Auth login/register/admin + sessieherstel</li>
          <li>Profiles admin overzicht met live updates</li>
          <li>Services-laag voor views en edge functies (Resend)</li>
        </ul>
      </section>

      <section className="card">
        <h2>Klaar voor volgende migraties</h2>
        <ul>
          <li>`features/projects/projectsService.ts` voor projectlogica</li>
          <li>`features/donations/donationsService.ts` voor donatielogica</li>
          <li>`services/edgeFunctions.ts` voor server-side workflows via Supabase Functions</li>
        </ul>
      </section>

      <section className="card">
        <h2>Nog te migreren uit legacy</h2>
        <ul>
          <li>Project dashboard UI en beheerflows</li>
          <li>Volledige donatie/checkout flow incl. Mollie</li>
          <li>Nieuws/content en overige adminmodules</li>
          <li>SEO metadata en alle publieke pagina's</li>
        </ul>
      </section>

      <section className="card">
        <Link to="/">Terug naar home</Link>
      </section>
    </main>
  )
}
