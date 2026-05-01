import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function PlaceholderPage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main role="main" id="mainContent" className="page-placeholder">
      <h1>{title}</h1>
      <p>
        Deze pagina wordt nog vanuit het grote HTML-bestand naar React overgezet. Je ziet nu alvast de juiste navigatie
        en styling.
      </p>
      {children}
      <p>
        <Link to="/" className="btn btn-blue">
          ← Terug naar home
        </Link>
      </p>
    </main>
  )
}
