# Mobiel & tablet — UI-analyse en optimalisatieplan

**Datum:** 2026-04-28  
**Scope:** Publieke site (React + legacy CSS) en React admin-portaal (`/admin/*`).

---

## 1. Architectuur (kort)

| Gebied | Bronnen UI |
|--------|------------|
| **Publieke site** | Hoofdstyling: `public/donatie-legacy-index.css` (~5700+ regels, veel `@media`). Bridge: `src/styles/donatie-shell-bridge.css`. Verouderde referentie: `src/styles/donatie-public.css` (niet importeren). |
| **Layout / nav** | `src/components/public/PublicLayout.tsx` — topnav, `nav-mobile` drawer, bottom-nav, footer, Donnie. |
| **Admin** | `src/styles/donatie-admin-portal.css` + secties onder `src/pages/admin/portal/sections/*.tsx`. |

**Wat al goed staat (niet onnodig wijzigen):**

- `body.has-public-nav` gebruikt `overflow-x: hidden` — basis tegen horizontale scroll.
- Home/hero: duidelijke breakpoints (1024 / 900 / 640 / 600 / 480px) — kolommen, sticker-promo, stats.
- **Ranglijst:** doordachte grid-breakpoints (1024 → 768 → 600 → 380px) voor compactere kolommen.
- **Sticker-carousel:** scroll-snap + safe patterns op smalle schermen (legacy CSS).
- **Admin:** bij `max-width: 880px` overlay-sidebar + `admin-portal-mobilebar`; `main-inner` padding omlaag (16px). Sommige secties hebben al `overflow-x: auto` op tabellen.

---

## 2. Publieke site — bevindingen

### 2.1 Kritiek: navigatie “dode zone” (601px–767px breedte)

**Observatie uit `public/donatie-legacy-index.css`:**

- Bij `max-width: 768px` worden `.nav-links` en `.nav-right .btn` verborgen (geen horizontale menubalk meer).
- De **hamburger** krijgt `display: none !important` (ook elders: `min-width: 641px` en `max-width: 640px` verbergen de hamburger).
- **Bottom navigation** wordt pas zichtbaar bij `max-width: 600px` (`bottom-nav { display: block }`).

**Gevolg:** tussen **601px en 767px** is er voor veel gebruikers **geen zichtbare hoofdnavigatie** (geen links, geen hamburger-trigger, geen bottom-nav). Alleen logo + (ingelogd) punten/accountruimte kan zichtbaar blijven — dat is onvoldoende om naar o.a. Goede doelen, FAQ, Denk mee te gaan.

**Aanbevolen fix (klein ingrijpen, groot effect):**

1. Breakpoints **aligneren**: óf bottom-nav tonen vanaf **768px** (gelijk aan waar `nav-links` verdwijnen), óf **`nav-mobile` openen weer beschikbaar maken** door hamburger alleen voor dat bereik te tonen én niet met `display: none !important` te blokkeren.
2. Dit is **herstel gedrag**, geen redesign: doel is dat elke viewport een duidelijke manier heeft om het volledige menu te bereiken.

### 2.2 Tablet (768px–1024px)

- Veel grids schakelen naar 1 kolom rond **1024px** (hero, game-split, footer deels).
- Footer: op ≤1024px nog **2 kolommen** footer-grid — acceptable; controleren op te kleine tap targets waar nodig.
- **Hypothese:** géén aparte regressie zoals bij 601–767, wel visuele controle op echte tablets (landscape/portrait).

### 2.3 Componenten met verhoogd risico (visuele audit)

| Onderdeel | Risico | Aanpak in plan |
|-----------|--------|----------------|
| **Tabellen** (ranglijst, admin-achtige blocks in publieke pagina’s) | Horizontale druk, kleine tekst | Behoud bestaande responsive grids; waar nodig `min-width: 0` + scroll container of card-stacking (alleen als inhoud echt breekt). |
| **Donatie-modal / auth** | `max-width` op modals in legacy CSS | Meestal OK; test op 320px breed. |
| **Kaarten / community / CbfCauseDetail** | Veel inline `style` in TSX | Geen massale rewrite; alleen aanpassen waar **overflow** of **vaste breedtes** problemen geven op testdevices. |
| **Maps (Leaflet)** | Touch + hoogte | Controleren pinch/scroll trapping; `min-height` op kleine schermen. |

### 2.4 Bottom nav vs. “Communities”

- `BASE_BOTTOM_NAV` heeft 6 vaste items; dezelfde voorwaarde als de topnav voegt **Community** toe na Ranglijst wanneer de gebruiker community-toegang heeft (`hasCommunityAccess`). Zie `PublicLayout` + klasse `bottom-nav-inner--7` in `donatie-shell-bridge.css`.

### 2.5 Toegankelijkheid & touch

- Skip-link aanwezig in `PublicLayout` — goed.
- Focus na verhelpen navigatie-issue: ESC sluit account-dropdown; mobile overlay zou focus trap kunnen gebruiken (verbetering, geen blocker).

---

## 3. Admin-portaal — bevindingen

### 3.1 Wat al goed staat

- **880px:** tweedelige grid → één kolom; sidebar als fullscreen overlay; compacte padding.
- **Dashboard cards:** `admin-portal-stats` gebruikt `auto-fit` + `minmax(210px, 1fr)` — bruikbaar op tablet.
- **Tabellen:** meerdere secties (`Communities`, `Goede doelen`, `E-mail`, `Influencers`) gebruiken **al** `overflowX: 'auto'` — goed patroon; consistent houden.

### 3.4 Verbeterpunten (geen volledige huisstijl-change)

| Item | Beschrijving | Prioriteit |
|------|--------------|------------|
| **Tabletten 768–1200px** | Side menu blijft desktop-zijbalk — OK; optioneel **inklapbare sidebar** of iets smallere `--sidebar` width — alleen als content te smal aanvoelt. | Laag |
| **Datatabellen op smalle schermen** | Waar geen `overflow-x` wrapper: horizontaal scrollen toevoegen of **kaart-weergave** per rij (grotere ingreep — later). | Medium |
| **Toasts** | `bottom: 24px; right: 24px` — op mobiel `max-width` + `left`/`right` inset + `env(safe-area-inset-bottom)` om overlap met OS-balk te vermijden. | Medium |
| **HTML e-mail templates (textarea)** | Grote blokken op telefoon scrollen in card — al werkt scroll; evt. collapsed “preview hoogte” — cosmetisch. | Laag |
| **Responsive preview (admin)** | Al bedoeld voor iframe-breedtes; geen wijziging tenzij shell padding op narrow. | Laag |

### 3.3 Legacy admin CSS in `donatie-legacy-index.css`

- Bevat nog `.admin-shell` regels voor **oude iframe-admin** — raakt het **nieuwe** React admin-portaal niet direct. Geen mengen tenzij je bewust legacy schermen op mobiel wilt fixen.

---

## 4. Optimalisatieplan (fasen)

**Uitgangspunt:** Alles wat geen probleem geeft **ongewijzigd laten**. Wijzigingen alleen waar een gebrek zichtbaar is of waar één fix een cascade voorkomt (zoals navigatie-breakpoints).

## Fase A — Herstel navigatie (✅ gedeeltelijk uitgevoerd, 2026-04-28)

- **Bron:** `public/donatie-legacy-index.css`
- Bottom-nav zichtbaar vanaf **`max-width: 768px`** (voorheen alleen ≤600px) + body/dashboard padding gelijk gezet.
- **Hamburger** weer **`display:flex`** onder 769px (oude dubbele `display:none !important`-regels uitgeschakeld ten gunste van breakpoint `769px`).
- **`nav-mobile.open`**: `z-index:610` zodat het overlay-menu niet onder de bottom-nav (600) valt.
- Donnie-chat + “bottom nav verbeterd” styling mee naar **768px** waar nodig.

**Handmatig verifiëren:** Chrome DevTools responsive 767px breed — topnav toont logo + rechts punten/account + ☰; onderaan bottom-nav; menu opent alle items.

### Fase B — Tablet polish (✅ uitgevoerd, 2026-04-28)

1. **CSS** — `src/styles/donatie-admin-portal.css`: `.admin-portal-table-wrap` (horizontaal scrollen), `.admin-portal-main { min-width: 0 }`, `.admin-portal-main-inner { width:100%; box-sizing }`, toast op smalle schermen met safe-area + volle breedte.
2. **Publiek** — `src/styles/donatie-shell-bridge.css`: `.public-site.donatie-legacy-spa { overflow-x: clip }` tegen breedte-bleed op tablet.
3. **Admin-secties** — alle `admin-portal-table`-blokken gewrapped in `admin-portal-table-wrap` (o.a. vrijwilligers, betalingen, gebruikers, sessies, FAQ, nieuws, shop, shadow, e-mail, influencers, communities, goede doelen); inline `overflowX: 'auto'` verwijderd.

### Fase C — Mobiel detail (✅ gedeeltelijk uitgevoerd, 2026-04-28)

1. ~~**Toasts / fixed UI** in admin~~ — basis gedaan in Fase B.
2. **`donatie-shell-bridge.css`:** modals met `env(safe-area-inset-*)` padding; `#donateModal .modal-box` met `max-width: min(440px, calc(100vw - 32px))`.
3. **`AdminFinanceSection`:** **`.admin-portal-period-toolbar`** + link-klasse — geen conflicterende inline `marginLeft: 'auto'`.
4. **`AccountDashboardPage`:** inline `gridTemplateColumns` op `#dashStatGrid4` verwijderd — volgt legacy `.dash-stat-grid` + `#page-dashboard`-breakpoints.

Optioneel later: extra publieke fixes op basis van screenshots.

### Fase D — Optioneel / product (✅ communities in bottom nav, 2026-04-28)

1. **Communities in bottom nav** wanneer `hasCommunityAccess` — zelfde logica als topnav; label **Community** (kort); icoon `communities` in `BottomNavIcon.tsx`; grid **7 kolommen** via `.bottom-nav-inner--7` + override in `donatie-shell-bridge.css`.

2. Card-layout voor admin-tabellen op zeer smalle schermen (nog open).

---

## 5. Testmatrix (handmatig of tooling)

| Viewport | Publiek | Admin |
|----------|---------|--------|
| 320×568 | Home, nav, auth | Login, dashboard scroll |
| 390×844 | idem + bottom nav | Sectie met tabel |
| 768×1024 (tablet) | Geen dead zone nav | Sidebar + content |
| 1024×768 | Desktop nav zichtbaar | breed lay-out |

---

## 6. Volgende concrete codestap (wanneer je implementatie wil)

1. Wijzig **alleen** `public/donatie-legacy-index.css` (en eventueel extract script `npm run extract:legacy-css` als jullie daarmee regenereren — check workflow) voor **breakpoint-harmonisatie navigatie**.
2. `npm run build` + visuele check `npm run dev` op responsive mode.

Dit document is bedoeld als **vast referentiepunt** bij het hervatten van het werk in een nieuwe chat.
