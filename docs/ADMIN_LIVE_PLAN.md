# Admin panel — React + Vite migratie, live via Supabase

Dit document is het routeboek. Lees dit in combinatie met `AGENTS.md` en `CURSOR_PROJECT_CONTEXT.md`.

## Architectuurbeslissingen

1. **Geen iframe meer.** `/admin` = nieuwe React-shell `src/pages/admin/portal/AdminPortalShell.tsx` met eigen sidebar en nested routes. De oude `/legacy-admin-index.html` blijft alleen nog bereikbaar via `/admin/legacy` als tijdelijke escape.
2. **Auth**: admin-login gebruikt nu **zowel** de bestaande Edge Function `admin-login` als `supabase.auth.signInWithPassword` zodat RLS met `is_platform_admin()` werkt. De Supabase-user moet `raw_app_meta_data.role = 'admin'` hebben (zie onderaan `SQL_ADMIN_LIVE_PHASE1.sql`).
3. **Alle nieuwe admin-tabellen staan in één idempotente migratie**: `docs/SQL_ADMIN_LIVE_PHASE1.sql`. Uitvoeren in Supabase SQL Editor. Herhaalbaar.
4. **Realtime**: `subscribeToTableChanges(...)` in `src/features/admin/adminContentService.ts`. Elke sectie met een lijst abonneert op `postgres_changes` en her-rendert.
5. **Onafhankelijke scroll**: zijbalk en hoofdcontent hebben elk `height:100vh; overflow-y:auto`. CSS staat in `src/styles/donatie-admin-portal.css`. Geen witruimte meer onder de donkerblauwe balk.

## Bestandsindeling

| Pad | Rol |
|-----|-----|
| `docs/SQL_ADMIN_LIVE_PHASE1.sql` | Alle nieuwe tabellen + RLS + realtime. Eenmalig draaien. |
| `src/features/admin/adminAccess.ts` | `fetchIsPlatformAdmin`, `trySupabaseAdminSignIn`, `signOutAdminSupabase` |
| `src/features/admin/adminContentService.ts` | CRUD + realtime helpers voor alle secties (nu Fase 1; breidt per sectie uit) |
| `src/pages/admin/portal/adminNav.ts` | Menustructuur met `livePhase1` flag |
| `src/pages/admin/portal/AdminPortalShell.tsx` | Shell, zijbalk, routing, scroll UX |
| `src/pages/admin/portal/sections/Admin*.tsx` | Eén bestand per sectie |
| `src/styles/donatie-admin-portal.css` | Alleen styling voor de portal |

## Fase 1 — KLAAR in deze migratie

- Dashboard (live stats via `admin_dashboard_stats()`-RPC + realtime op donations/profiles/communities/sessions/volunteer_requests)
- Uitgelichte doelen (CRUD + volgorde + zichtbaar/verborgen)
- FAQ beheren (CRUD + zichtbaar/verborgen + sort_order)
- Nieuwsbeheer (CRUD + publiceren/depubliceren)
- React admin shell met onafhankelijke zij- en hoofdscroll
- Beheerdersaccounts-tab is **weg** (niet opgenomen in `ADMIN_SECTIONS`)

## Fase 2 — Per sectie te bouwen (backend staat klaar)

Hieronder wat er per sectie nog als React-UI moet komen. SQL en RLS zijn er al in Fase 1, behalve waar expliciet vermeld.

### Goede doelen beheer
- Tabel: `site_charity_causes` (bestaat, uit `SQL_SUPABASE_DEPLOY_PART1.sql`).
- UI: lijst + nieuw cause toevoegen + sector + paspoort + actief-toggle.
- Publieke koppeling: `src/features/legacy/cbfCauses.generated.ts` is een statische fallback; publieke pagina’s moeten óók `site_charity_causes` lezen als bron.

### Navigatiebalk (bewust geen productfeature)
- **Geen** admin-sectie en **geen** bewerkbare menustructuur via `site_settings`. De publieke site gebruikt vaste items in `PublicLayout.tsx` (`BASE_NAV` / bottom nav). Oude SQL (`SQL_ADMIN_LIVE_PHASE5_NAVBAR.sql`) of resterende `navbar_items` in de database zijn **legacy/optioneel**; bouw geen beheer-UI en voeg die niet opnieuw toe.

### Logo's & branding
- Opslag: `site_settings` key = `branding` (jsonb `{ logoNavUrl, logoAuthUrl, stickerLogoUrl, faviconUrl, primary, accent, ... }`).
- Storage: Supabase Storage bucket **`site-branding`** (public). Moet nog aangemaakt worden in Dashboard of via SQL `insert into storage.buckets (id, name, public) values ('site-branding','site-branding', true) on conflict do nothing;`.
- UI: upload via `supabase.storage.from('site-branding').upload(...)`, public URL opslaan in `branding`.

### Homepage beheer
- Opslag: `site_settings` key = `homepage` (jsonb: hero titel/sub, knoppen, welke blokken actief, banner-url, CTA’s).
- Publiek: `PublicHomePage.tsx` leest deze en renderpaden blijven zelfde.

### Gebruikersoverzicht
- Bron: `profiles` + `auth.users` via RPC (maak `admin_user_overview(p_search text, p_limit int, p_offset int)` in Fase 2).
- UI: zoek, paginate, klik = details.
- **Niet:** direct `auth.users` lezen vanuit de client — gebruik een SECURITY DEFINER RPC.

### Influencers & communities
- Bron: `communities` + `community_members` + owner-profiel. Admin-policies bestaan al indien admin via `is_platform_admin` leest; anders voeg toe:
  - `create policy communities_select_admin on public.communities for select to authenticated using (public.is_platform_admin(auth.uid()));`
- UI: lijst, filter op kind (bedrijf/influencer).

### Community beheer
- Uitgebreide editor voor een community: posts, leden, sponsors, shop-items.
- Gebruikt bestaande tabellen en RPC’s (`community_posts`, `community_shop_items`, etc.).

### Vrijwilliger verzoeken
- Tabel: `volunteer_requests` (Fase 1 klaar).
- UI admin: lijst open verzoeken, approve/reject knop → trigger updatet `profiles.is_volunteer`.
- **UI publiek (Fase 2):** knop "Meld je aan als vrijwilliger" in profielinstellingen, inserts `volunteer_requests` met `status='pending'`. Nog te bouwen in `AccountDashboardPage.tsx` of nieuw `VolunteerApplyPanel.tsx`.

### Markten & modules
- Opslag: `site_settings` key = `markten_modules` (jsonb `{ modules: [{ id, enabled }], campaigns: [...] }`).
- Als campagnes echte rijen moeten zijn: tabel `site_campaigns (id uuid, title, kind, config jsonb, active, ...)` (Fase 2, niet in Fase 1-migratie).

### Puntensysteem beheer
- Opslag: `site_settings` key = `points_config` (jsonb: punten per euro, actiemultipliers, rounding).
- Publiek effect: `createDonation` zal deze config gaan lezen (nu hardcoded `amount/10*5`).

### Puntenwinkel
- Tabel: `site_shop_items` (bestaat). RLS staat al admin write.
- UI admin: lijst + add/edit/delete + voorraad + actief.
- Publieke side leest uit dezelfde tabel.

### Donatiebedragen
- Opslag: `site_settings` key = `donation_amounts` (jsonb: `{ eenmalig_min, maandelijks_min, default_buckets: [5,10,25,50,100] }`).
- `donationsService.validateMinimumAmount` moet deze gaan gebruiken.

### Meldingen (fondsenwerver → admin)
- Tabel: `site_notifications` met `type='melding'`.
- UI admin: lijst + mark as read + verwijderen.
- Publiek: gebruiker kan een melding indienen via `site_notifications.insert({ type:'melding', from_user_id: auth.uid(), ... })` (RLS staat dat toe).

### Pushberichten (admin → gebruiker)
- Tabel: `site_notifications` met `type='push'`.
- UI admin: formulier `target_user_id` (of `null` voor broadcast) + titel + body + icon.
- Publiek: per-user inbox leest eigen + broadcast berichten.

### Actieve sessies + shadow meekijken
- Tabel `active_sessions` (Fase 1 klaar) + heartbeat RPC `heartbeat_session`.
- **Frontend hook (Fase 2)**: in `PublicLayout` elke 30s `supabase.rpc('heartbeat_session', { p_route: location.pathname, p_user_agent: navigator.userAgent })`.
- **Admin UI**: `admin_list_active_sessions()` RPC (klaar) → lijst + zoekbalk + "meekijken"-knop zichtbaar als `shadow_granted=true`.
- **Meekijk-UI**: apart `/admin/shadow/:userId`-scherm dat leeftijdige data van de user leest (profielinfo, laatste donaties, communities). Geen screen-share: een read-only kopie van profielstatus. Live via realtime op `profiles`, `donations`, `active_sessions`.
- **Gebruiker-zijde**: knop in profielinstellingen → upsert in `admin_shadow_grants` met `granted=true`. Kan altijd intrekken.

### Betalingen
- Bron: `donations` tabel (bestaat).
- UI admin: lijst betaalde + gerefunde donaties. Refunds in rode letters. Realtime op `donations`. Gebruik bestaande fields `status` en `refunded_at`.
- Geen nieuwe SQL nodig.

### Financieel overzicht
- RPC `admin_finance_overview(p_days)` (Fase 1 klaar).
- UI: periode-kiezer (7/30/90 dagen), counters, grafiek.

### Footer & juridisch
- Opslag: `site_settings` key = `footer_content` + `legal_pages` (jsonb: per slug → title/body).
- Publiek: `PublicSiteFooter.tsx` en `LegalInfoPage.tsx` lezen deze.

### E-mail templates + versturen
- **Vereist jouw keuze voor afzender:**
  - *Eigen domein (aanbevolen)*: maak/verifieer `noreply@donatie.eu` (of andere alias) in Resend. Resend geeft DKIM/SPF DNS-records die je toevoegt bij je domeinprovider. Dan verstuurt de Edge Function via je eigen domein.
  - *Gmail/Outlook*: **niet geschikt** voor transactionele mails. Je kunt Gmail SMTP wel gebruiken maar dat is rate-limited (500/dag) en klanten zien "via gmail.com". Niet doen voor productie.
- **Backend**: Edge Function `send-email` + tabel `site_email_templates` met velden `key, subject, html, updated_at`.
- **Secrets** (al aanwezig volgens jouw bericht): `RESEND_API_KEY`. Nodig extra: `EMAIL_FROM` (bv. `Donatie.eu <noreply@donatie.eu>`).
- **Triggers** per type mail: welcome (op signup), donation_paid (in mollie-webhook), volunteer_approved (op status-update).

### Responsive preview
- Nu: iframe met publieke site op verschillende breedtes (simpel).
- Live-sync komt automatisch doordat publieke site de Supabase data leest.

## Wat ik nodig heb van jou voor Fase 2

1. **Schema dump** (Supabase Dashboard → SQL Editor):
   ```sql
   select table_name, column_name, data_type
   from information_schema.columns
   where table_schema = 'public'
   order by table_name, ordinal_position;
   ```
   Plak het resultaat, zodat ik weet welke bestaande SQL-migraties uit `docs/` al gedraaid zijn en welke niet.
2. **Resend**: bevestiging welk afzender-domein je gebruikt (bv. `noreply@donatie.eu`) en of DNS-records al geverifieerd zijn in Resend.
3. **Admin-user**: bestaat er al een Supabase Auth user die admin is? Zo nee, maak een nieuwe aan in Dashboard → Authentication → Users, en draai daarna:
   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('role','admin')
   where email = 'admin@donatie.eu';
   ```
4. **Prioriteit Fase 2**: welke secties eerst? Ik stel voor: Vrijwilliger (nieuw feature voor publieke kant), Betalingen (refund-zichtbaarheid), Puntenwinkel, Meldingen/Push. Laat weten of je andere volgorde wilt.

## Deploy-volgorde

1. Draai `docs/SQL_ADMIN_LIVE_PHASE1.sql` in Supabase SQL Editor.
2. Maak admin-user aan en zet role=admin (zie boven).
3. `npm run build` lokaal om te valideren dat TS compileert (is groen in deze iteratie).
4. `npm run dev` → navigeer naar `/admin/login`.
