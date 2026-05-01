# React + Vite structuur

## Doel
Een duidelijke webframework-structuur waarin UI, domain logic en integrations gescheiden zijn.

## Mapindeling
- `src/app` routing en app composition
- `src/pages` pagina-level views
- `src/features` feature modules per domein
  - `auth`
  - `projects`
  - `donations`
- `src/services` app-brede services
  - view reads
  - edge function wrappers
- `src/lib` infrastructuur clients (Supabase)
- `src/types` gedeelde domain types

## Integratiepatroon
- Frontend schrijft/leest alleen met veilige client calls.
- Gevoelige acties (zoals mail en betalingen) via edge functions/backend.
- Realtime admin updates via Supabase Realtime subscriptions.
- Mollie checkout gaat via edge function contract (`create-mollie-payment`) met pending fallback.

## Migratievolgorde (aanbevolen)
1. Auth (afgerond)
2. Profiles/admin overzicht (afgerond)
3. Projects UI + beheer
4. Donations UI + checkout orchestration
5. Mollie backend flow en webhook handling
6. SEO/public pages afronden
