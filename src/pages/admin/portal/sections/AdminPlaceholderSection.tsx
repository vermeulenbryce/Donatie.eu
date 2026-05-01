import { ADMIN_SECTIONS, type AdminSectionId } from '../adminNav'

export function AdminPlaceholderSection({ id }: { id: AdminSectionId }) {
  const section = ADMIN_SECTIONS.find((s) => s.id === id)
  return (
    <div className="admin-portal-card">
      <h2 className="admin-portal-card-title">{section?.label ?? 'Onbekende sectie'}</h2>
      <p className="admin-portal-card-sub">
        In aanbouw (Fase 2). SQL-fundering staat klaar in <code>docs/SQL_ADMIN_LIVE_PHASE1.sql</code>; de React-UI
        voor deze sectie wordt in een volgende iteratie toegevoegd en zal realtime meewerken met de publieke site.
      </p>
      <div className="admin-portal-empty">Nog niets om te tonen.</div>
    </div>
  )
}
