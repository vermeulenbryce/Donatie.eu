# Admin & publieke site — functionele testchecklist

Gebruik dit na elke grotere wijziging of deploy om te bevestigen dat gedrag klopt. **Vereist:** `.env.local` met `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`, en een account met platform-adminrechten (`raw_app_meta_data.role = 'admin'` en/of `profiles.is_admin` — zie `docs/SQL_ADMIN_LIVE_PHASE2.sql`).

**Basis (altijd eerst)**  
1. `npm run build` — geen TypeScript/bundler-fouten.  
2. `npm run dev` → `http://localhost:5173`.  
3. Ga naar `/admin/login`, log in als admin.  
4. Controleer dat de **Supabase**-status in de admin-zijbalk **niet** “geen rol” is (anders is RLS/write beperkt).

---

## Per sectie — wat je kunt testen

| Sectie (route) | Zo weet je dat het werkt |
|----------------|---------------------------|
| **Dashboard** (`/admin` of `/admin/dashboard`) | Tellingen laden zonder rode foutbanner; na actie op de site (bv. nieuwe donatie) verversen stats binnen ~30s of na handmatig verversen. |
| **Uitgelichte doelen** (`/admin/featured`) | Doel toevoegen uit de lijst, volgorde ↑↓, tonen/verbergen. **Publiek:** homepage toont uitgelichte blokken conform data. |
| **Goede doelen beheer** (`/admin/goededoelen`) | Doel toevoegen (zoeken in volledige ANBI+CBF-lijst), actief toggle, sorteren. **Publiek:** `/goede-doelen` toont live rijen uit `site_charity_causes` (of fallback als tabel leeg). |
| **FAQ** (`/admin/faq`) | CRUD + zichtbaarheid. **Publiek:** `/faq` toont dezelfde items. |
| **Logo's & branding** (`/admin/logos`) | URL of upload (bucket `site-branding`), Opslaan. **Publiek:** header/footer/admin-logo en favicon updaten. |
| **Homepage beheer** (`/admin/homepage`) | Velden opslaan. **Publiek:** `/` hero/trust/stats-teksten zoals ingesteld. |
| **Nieuws** (`/admin/nieuws`) | Artikel publiceren/verbergen. **Publiek:** `/nieuws`. |
| **Gebruikersoverzicht** (`/admin/users`) | Zoeken geeft rijen; paginatie Vorige/Volgende; **Meekijken** opent `/admin/shadow/:id` (na grant). **DB:** `docs/SQL_FIX_ADMIN_SEARCH_USERS_OFFSET.sql` moet gedraaid zijn voor `p_offset`. |
| **Vrijwilliger** (`/admin/vrijwilliger`) | Open verzoeken zichtbaar; goedkeuren/afwijzen werkt. **Publiek:** `/account/vrijwilliger` indien van toepassing. |
| **Puntensysteem** (`/admin/punten`) | Divisor + punten per stap opslaan; voorbeeldbedrag wijzigt de preview. **Publiek:** `createDonation` + doneermodal gebruiken dezelfde formule (cache ±1 min). |
| **Donatiebedragen** (`/admin/bedragen`) | Minimum eenmalig/maandelijks + snelkoppelbedragen opslaan. **Publiek:** te laag donatiebedrag in flow → fouttekst toont de ingestelde minima. |
| **Puntenwinkel** (`/admin/shop`) | Items CRUD. **Publiek:** shop leestzelfde tabel. |
| **Meldingen** (`/admin/meldingen`) | Inkomende meldingen lezen/verwijderen. |
| **Pushberichten** (`/admin/push`) | Bericht aan user (zoeken via dezelfde user-search RPC). |
| **Actieve sessies** (`/admin/sessions`) | Heartbeat van ingelogde gebruikers: open publieke site in andere browser, zie sessie (event. even wachten op poll). |
| **Betalingen** (`/admin/betalingen`) | Lijst donaties, zoekfilter, refunds zichtbaar. |
| **Financieel overzicht** (`/admin/finance`) | Periode 7/30/90 dagen wisselt de totalen; na testdonatie (indien mogelijk) stijgen betaald-aantallen na realtime/refresh. |
| **Footer & juridisch** (`/admin/footer`) | Footer JSON valideren + opslaan; juridische blokken opslaan. **Publiek:** scroll naar footer + open een `/juridisch/...` pagina — tekst matcht opgeslagen `legal_pages` (anders defaults). |

---

## Publieke routes (snel)

- `/` — homepage + branding + featured + footer.  
- `/goede-doelen` — charity causes.  
- `/faq`, `/nieuws`, `/juridisch/privacybeleid` (en andere juridische paden uit de router).  
- `/auth` → inloggen → `/account` — sessie en eventueel heartbeat voor admin-sessies.

---

## Als iets faalt

1. **Browserconsole (F12)** — netwerkfout op `supabase.co` of 401/403 → RLS of ontbrekende migratie.  
2. **Supabase → Logs / SQL** — RPC-fout (bijv. onbekende `admin_search_users` signature) → bijbehorend `docs/SQL_*.sql` uitvoeren.  
3. **Real-time** — `docs/SQL_FIX_REALTIME_PUBLICATION.sql` als tabellen niet in `supabase_realtime` publicatie staan.

---

*Werk deze lijst bij wanneer nieuwe admin-secties live gaen.*
