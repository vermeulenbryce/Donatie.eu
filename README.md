# Donatie.eu React Migratie

Nieuwe React + Vite basis voor de migratie vanaf de bestaande `index.html` webapp.

## Starten

1. Installeer dependencies:
   - `npm install`
2. Maak lokale env:
   - kopieer `.env.example` naar `.env.local`
3. Vul Supabase variabelen in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Start development:
   - `npm run dev`

## Projectstructuur

- `src/app` routing en app-level setup
- `src/pages` pagina's
- `src/components` herbruikbare UI
- `src/features` domeinspecifieke code (auth, payments, projecten)
- `src/lib` clients/utilities (zoals Supabase)
- `src/services` API wrappers
- `src/types` gedeelde TypeScript types
- `docs` migratie-notities en checklists

## Volgende migratiestappen

- Inventariseer features uit oude `index.html` (Supabase, Resend, Mollie gerelateerd)
- Migreer eerst 1 verticale flow (bijv. login + data ophalen)
- Valideer design en gedrag na elke migratiestap
- Verplaats gevoelige logica (Resend/Mollie secrets) naar server/edge functies
