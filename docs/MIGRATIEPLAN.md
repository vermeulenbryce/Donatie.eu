# Migratieplan vanaf legacy `index.html`

## Doel
De bestaande webapp gecontroleerd overzetten naar React + Vite, zonder verlies van design of functionaliteit.

## Fase 1 - Basis (afgerond)
- React + Vite + TypeScript opgezet
- Schaalbare mappenstructuur aangemaakt
- Supabase client bootstrap toegevoegd via env vars

## Fase 2 - Inventarisatie legacy (eerstvolgende stap)
- Alle Supabase aanroepen in kaart brengen
- Edge function calls (Resend flows) documenteren
- Mollie-gerelateerde placeholders/integraties isoleren
- Belangrijkste user flows vastleggen (doneren, login, dashboard, admin)

## Fase 3 - Gefaseerde migratie
1. Layout shell + hoofdnavigatie
2. Auth en sessiebeheer
3. Projecten en donatie-overzicht
4. Donatieflow (incl. payment startpunt)
5. Adminfunctionaliteit
6. Overige pagina's/SEO tuning

## Fase 4 - Integraties harden
- Resend alleen via edge functions/backend
- Mollie create-payment + webhook afhandeling backend-side
- Frontend enkel veilige publieke sleutels en status-endpoints

## Fase 5 - Deploy voorbereiding
- Build validatie: `npm run build`
- Hostingkeuze: S3 + CloudFront
- Terraform indeling: `dev`, `staging`, `prod`
- CI/CD pipeline: build, upload, cache invalidatie
