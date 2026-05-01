# Donatie.eu — context voor Cursor (handoff)

**Voor AI-agents (Cursor, Composer, enz.):** lees ook [`AGENTS.md`](./AGENTS.md) — werkvolgorde, non-negotiables, waar je wijzigingen plaatst en hoe je lokaal draait.

Dit bestand is bedoeld om **bij een nieuw Cursor Pro-account** (of nieuwe chat) mee te geven: het vat de **webapp** en **relevante beslissingen uit eerdere chats** samen. Open het in het project of `@`-verwijs ernaar in een nieuwe sessie.

**Projectnaam:** `donatie-react-vite`  
**Product:** Donatie.eu — publieke site voor doneren aan CBF-goede doelen, punten/ranglijst, communities (bedrijf/influencer), community-projecten, Mollie-betalingen via Supabase.

---

## Stack

- **React 19** + **TypeScript** + **Vite 8**
- **React Router 7** (`BrowserRouter`, routes in `src/app/router.tsx`)
- **Supabase** (`@supabase/supabase-js`) — auth, Postgres, RPC’s, storage
- **Mollie** — via Edge Function o.a. `supabase/functions/create-mollie-payment` en client `src/features/donations/donationsService.ts`
- **Leaflet** — kaarten (o.a. goede doelen)
- **DOMPurify** — sanitization Donnie-chat HTML

Scripts: `npm run dev` (Vite `--host`), `npm run build`, `npm run lint`, `npm run preview`.

---

## Belangrijkste mappen (`src/`)

| Pad | Rol |
|-----|-----|
| `app/router.tsx` | Alle routes; publieke routes onder `PublicLayout` |
| `context/LegacyUiSessionContext.tsx` | Centrale “shell” / demo / Supabase-user state voor veel publieke UI |
| `components/public/` | Publieke layout, nav, Donnie, homepage-blokken, etc. |
| `pages/public/` | Publieke pagina’s (home, goede doelen, account, communities, …) |
| `pages/admin/` | Admin login + portal (`AdminLoginPage`, `AdminPortalPage`) |
| `features/auth/` | Login/registratie (`authService`, sessie) |
| `features/community/communityProjectsService.ts` | Communities, leden/sponsors, projecten, shop, posts, **project-fetch voor doneren** |
| `features/donations/donationsService.ts` | `createDonation`, Mollie checkout, minimumbedragen |
| `features/donnie/` | Donnie antwoord-engine + PDF-rapport |
| `features/public/ranglijstLeaderboards.ts` | Ranglijst (o.a. `members_only`-projecten uit leaderboard) |
| `lib/supabase.ts` | Supabase client + `isSupabaseConfigured` |
| `lib/sanitizeDonnieHtml.ts` | DOMPurify-config voor chat-bubbles |
| `types/domain.ts` | o.a. `Project`, donaties |

**Legacy:** `public/legacy-admin-index.html`, `public/donatie-legacy-index.css` — groot legacy-admin-blok; React **AdminPortalPage** laadt legacy in een iframe (`/legacy-admin-index.html`).

---

## Routes (kort)

- Publiek onder `PublicLayout`: `/`, `/goede-doelen`, `/ranglijst`, `/account`, `/communities`, `/community-project/:projectId`, `/auth`, `/auth/reset-password`, juridische pagina’s, etc.
- **Community-project doneren:** `/community-project/:projectId` → `CommunityProjectDonatePage`
- Admin: `/admin/login`, `/admin` (na client-check → legacy iframe)
- Overig platform: `/platform`, `/projects`, `/donations`, …

---

## Authenticatie & admin

- **Supabase Auth** voor normale gebruikers; `LegacyUiSessionContext` voedt veel componenten.
- **Wachtwoord-reset:** in `index.html` staat een **klein inline script** vóór de module: zet `sessionStorage` key `donatie:pw-recovery-intent` op `/auth/reset-password` zodat de intent bewaard blijft als Supabase de hash daarna wist. **Niet verwijderen zonder alternatief vóór module-load.**
- **Admin:** `adminSession.ts` — `setAdminSessionOk` / `isAdminSessionOk` / `clearAdminSession`; sessie in `sessionStorage` met **TTL (8 uur)** en backward compatibility voor oude waarde `'1'`. Dit is **alleen client-side “deur”**; echte autorisatie moet server/legacy blijven doen.

---

## Communities & projectdonaties (recente productlogica)

**Probleem dat opgelost is:** `members_only`-projecten waren voor leden/sponsors onbruikbaar omdat:

1. `fetchPublicCommunityProject` alleen `visibility === 'public'` toeliet.
2. UI-links naar de donatiepagina ontbraken vaak voor `members_only`.

**Huidige aanpak:**

- `fetchCommunityProjectForDonation(projectId, viewerUserId)` in `communityProjectsService.ts`:
  - **Publiek project:** iedereen mag de pagina laden (doneren nog steeds login).
  - **`members_only`:** alleen als ingelogd én (**rij in `community_members`** OF **community-eigenaar** via `communities.owner_user_id`).
- Result types: `ok` | `not_found` | `members_only_need_login` | `members_only_forbidden` — `CommunityProjectDonatePage` toont passende meldingen.
- Links op **CommunitiesPage** en **DashMijnCommunitySection** tonen ook voor `members_only` een donatielink (tekst maakt duidelijk dat het community-gericht is).

**Alleen eenmalige donaties voor projecten:**

- UI: geen maandelijkse keuze meer op `CommunityProjectDonatePage`.
- `createDonation` in `donationsService.ts`: als `projectId` gezet is → type wordt **gedwongen `eenmalig`** (ook als iemand de client zou manipuleren).

---

## Beveiliging & UX (eerdere optimalisaties)

- **Donnie / XSS:** `DonnieChatbot` rendert HTML via `dangerouslySetInnerHTML`; output gaat door `sanitizeDonnieBubbleHtml` (DOMPurify, strikte allowlist). PDF-knop gebruikt **class** `.donnie-pdf-btn` in `index.css` (geen inline `style` in HTML, zodat sanitizer niet strip wat nodig is).
- **`index.html`:** meta’s o.a. `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **`vite.config.ts`:** o.a. `manualChunks` (react / supabase), `preview.headers` als spiegel voor security headers.

**Nog niet in deze repo (aanbevolen op hosting):** volledige **CSP + headers op HTTP-niveau**; gefaseerd (Report-Only → enforce) om `connect-src` (Supabase), fonts, `unpkg` (Leaflet CSS), Mollie niet te breken.

---

## Bekende technische schuld / aandachtspunten

- **`npm run lint`** kan falen op **react-hooks**-regels (o.a. refs tijdens render in `DonnieChatbot`, `setState` in effects in meerdere bestanden). Niet alles is opgelost; refactors moeten gedrag behouden.
- **Build:** grote `index`-chunk (~650kB+ minified); route-**lazy loading** is een logische volgende stap (UI hetzelfde, eventueel korte loading bij eerste bezoek aan een route).
- **Supabase RLS:** policies zijn leidend naast app-logica; te strak = features stuk, te ruim = datalek. Test altijd met echte rollen (lid, sponsor, eigenaar, anoniem).

---

## Risico’s CSP vs database policies (samenvatting)

- **CSP te streng:** browser blokkeert scripts, styles, fonts of `fetch` naar API’s → stille of halve defecten; oplossing: Report-Only, daarna aanscherpen, kernflows testen.
- **RLS fout:** te open = privacy-risico; te dicht = 403/lege data. Altijd na wijziging **donatie-, community- en auth-flows** doorlopen.

---

## Chatgeschiedenis — wat er besproken/geïmplementeerd is (relevant)

1. **Veiligheid/optimalisatie:** DOMPurify Donnie, security meta’s, admin TTL, Vite chunks/preview headers; inline recovery-script bewust behouden i.v.m. timing vóór Supabase.
2. **React + Vite:** bevestigd dat de stack dat blijft; inline script is uitzondering, geen tweede framework.
3. **Community-projectdonaties:** `members_only` toegankelijk voor leden/sponsors/eigenaar; donaties aan projecten alleen **eenmalig** (UI + `createDonation`).
4. **Aanbevelingen (nog deels te doen):** CSP op productie, RLS-review, route code-splitting, ESLint-technische schuld, E2E-smoke, Sentry, toegankelijkheid.
5. **“Blijft UI hetzelfde?”:** ja, mits CSP/RLS zorgvuldig; lazy routes kunnen een minieme eerste-load tonen.

---

## Hoe dit in een nieuwe Cursor-sessie te gebruiken

1. Clone/open het project en zorg dat `CURSOR_PROJECT_CONTEXT.md` in de **root** staat (naast `package.json`).
2. In een nieuwe chat: **@CURSOR_PROJECT_CONTEXT.md** of plak: “Lees `CURSOR_PROJECT_CONTEXT.md` als projectbron.”
3. Optioneel: maak in Cursor een **Rule** die verwijst naar dit bestand voor dit workspace.

---

*Laatste update samengesteld voor handoff naar nieuw Cursor-account; pas datum/punten aan na grote wijzigingen in de codebase.*
