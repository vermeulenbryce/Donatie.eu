# AGENTS.md — Donatie.eu (donatie-react-vite)

Instructions for AI coding agents (Cursor, Composer, etc.) working in this repository. **Product and Dutch handoff details** live in [`CURSOR_PROJECT_CONTEXT.md`](./CURSOR_PROJECT_CONTEXT.md) — read that when you need stack, routes, security notes, and past decisions.

---

## Local development (see the app in the browser)

1. `npm install` (once)
2. Copy `.env.example` → `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for full auth/data; the UI can still load without them, with limited functionality.
3. `npm run dev` — Vite listens on **port 5173** with `--host` (LAN-friendly). Open **http://localhost:5173** (or the machine’s LAN IP from the terminal output).

---

## Architecture in one paragraph

- **React 19 + Vite + TypeScript + React Router 7.** Entry: `src/main.tsx` → `src/app/router.tsx`.
- **Public site** uses `PublicLayout` and `LegacyUiSessionProvider` — session + demo shell in `src/context/LegacyUiSessionContext.tsx`.
- **Domain logic** belongs in `src/features/<area>/` (auth, donations, community, donnie, legacy, …), not in page files.
- **Supabase** client: `src/lib/supabase.ts`. **Mollie** via Edge Functions `supabase/functions/create-mollie-payment` and `mollie-webhook`; client orchestration in `src/features/donations/donationsService.ts`.
- **Legacy parity:** localStorage keys (`dnl_*`), extracted CSS `public/donatie-legacy-index.css`, and optional **admin iframe** `public/legacy-admin-index.html` — do not remove casually.

---

## Non-negotiables (do not break without an explicit replacement)

1. **`index.html` inline script** before the module that sets `sessionStorage` key `donatie:pw-recovery-intent` on the password-reset route — Supabase can strip the recovery hash; this preserves intent. Mirror logic: `readPasswordRecoveryIntent()` in `src/features/auth/authService.ts`.
2. **Project-bound donations are one-off only:** `createDonation` in `donationsService.ts` forces `eenmalig` when `projectId` is set.
3. **Community project access** for donation page: `fetchCommunityProjectForDonation` in `communityProjectsService.ts` returns `ok` | `not_found` | `members_only_need_login` | `members_only_forbidden` — keep UI handling aligned.
4. **Donnie chat HTML:** sanitize with `src/lib/sanitizeDonnieHtml.ts` (DOMPurify allowlist). PDF button uses class `donnie-pdf-btn`, not inline styles in generated HTML.
5. **Mollie Edge contract:** responses use `mode`, `checkoutUrl`, `molliePaymentId`, `message`. Client uses `supabase.functions.invoke` plus a **fetch fallback** with anon key — keep both unless you replace with an equivalent.

---

## Where to put changes

| Change type | Location |
|-------------|----------|
| New route | `src/app/router.tsx` + page under `src/pages/` |
| Auth / session / reset | `src/features/auth/authService.ts`, `src/pages/PasswordResetPage.tsx` |
| Donations / Mollie client | `src/features/donations/donationsService.ts` |
| Communities / projects / RPC calls | `src/features/community/communityProjectsService.ts` |
| Public shell / nav / Donnie | `src/components/public/`, `PublicLayout.tsx` |
| Admin portal (React, `/admin/*`) | `src/pages/admin/portal/**` + `src/features/admin/**` + `docs/SQL_ADMIN_LIVE_PHASE1.sql` — **geen** apart beheer van de publieke hoofdnav (`PublicLayout` `BASE_NAV`; zie `docs/ADMIN_LIVE_PLAN.md`) |
| Shared types | `src/types/domain.ts`, `src/types/auth.ts` |
| DB / RLS reference SQL | `docs/SQL_*.sql` |
| Edge Functions | `supabase/functions/<name>/index.ts` |

---

## Suggested reading order (new session)

1. [`CURSOR_PROJECT_CONTEXT.md`](./CURSOR_PROJECT_CONTEXT.md)
2. `src/app/router.tsx`
3. `src/context/LegacyUiSessionContext.tsx`
4. `src/features/auth/authService.ts`
5. `src/features/donations/donationsService.ts`
6. `src/features/community/communityProjectsService.ts` (large; search for the function you need)
7. `docs/ARCHITECTURE.md`
8. For admin work: [`docs/ADMIN_LIVE_PLAN.md`](./docs/ADMIN_LIVE_PLAN.md) + `src/pages/admin/portal/AdminPortalShell.tsx` + `src/features/admin/adminContentService.ts`  
9. **Na admin/publieke wijzigingen:** hanteer de functionele stappen in [`docs/ADMIN_FUNCTIONAL_TEST_CHECKLIST.md`](./docs/ADMIN_FUNCTIONAL_TEST_CHECKLIST.md) (of breid die uit) zodat er altijd een duidelijke **test- en verificatie**-route is.

---

## Known constraints

- **ESLint / react-hooks:** some files intentionally diverge; refactors must preserve behavior (see `CURSOR_PROJECT_CONTEXT.md`).
- **RLS** on Supabase is authoritative — test with real roles after policy changes.
- **CSP** on production hosting: plan Report-Only first; mind `connect-src` (Supabase), fonts, unpkg (Leaflet CSS).

---

## Commit / PR discipline

- Small, focused diffs; match existing naming and patterns.
- Run `npm run build` before merging when types or bundling might be affected.
- Voor **PR’s die admin of `site_settings` / RLS raken:** vermeld in de beschrijving kort **welke punten** uit `docs/ADMIN_FUNCTIONAL_TEST_CHECKLIST.md` je hebt afgelopen (of wat niet getest kon worden).
