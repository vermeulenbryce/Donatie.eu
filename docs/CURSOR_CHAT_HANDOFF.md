# Handoff — admin portal + e-mail (vasthouden na Cursor sluiten)

**Laatst bijgewerkt:** 2026-04-24  
**Doel:** Als een Cursor-chat verloren gaat, kun je in een **nieuwe chat** zeggen: *lees `docs/CURSOR_CHAT_HANDOFF.md` en ga verder*.

---

## Wat er in deze sessie/traject gedaan is (samenvatting)

- **Admin portal (React)** op `/admin` — shell: `src/pages/admin/portal/AdminPortalShell.tsx`, nav: `adminNav.ts`.
- **Fase 2-secties geïmplementeerd** (naast eerdere Fase 1): o.a. responsive preview, influencers & communities, community beheer, markten & modules, e-mail templates.
- **Publieke navigatiebalk** is **geen** admin-feature (`docs/ADMIN_LIVE_PLAN.md`).
- **E-mail:** tabel `site_email_templates`, Edge Function `send-email` (Resend), triggers: welcome (registratie), `donation_paid` (Mollie-webhook), `volunteer_approved` (admin goedkeuring vrijwilliger).
- **Mollie-webhook** zet bij `paid` o.a. `status`, **`paid_at` (kolom)** én `metadata` (i.v.m. rapportages/RPC’s die `donations.paid_at` lezen).
- **RLS:** aparte SQL-scripts voor admin-leesrechten o.a. communities/community_posts/shop/projects; quiz-fix apart.

---

## Edge Functions (wat de app verwacht)

| Naam | Rol |
|------|-----|
| `admin-login` | Admin-login (naast Supabase `signInWithPassword`) |
| `create-mollie-payment` | Checkout |
| `mollie-webhook` | Status + intern `send-email` voor betaalde donatie |
| `send-email` | Transactionele mail via Resend + DB-templates |

E-mailverificatie en wachtwoord reset zijn **Supabase Auth**-instellingen, geen extra functions hiervoor.

**Lokaal in repo:** `supabase/config.toml` bevat o.a. `create-mollie-payment`, `mollie-webhook`, `send-email`.

---

## SQL-bestanden (handig om te weten welke je hebt gedraaid)

- `docs/SQL_ADMIN_LIVE_PHASE1.sql` — basis admin-tabellen/RLS (als nog niet eens gedaan).
- `docs/SQL_ADMIN_EMAIL_TEMPLATES.sql` — `site_email_templates` + seeds.
- `docs/SQL_ADMIN_INFLUENCERS_COMMUNITIES_READ.sql` — admin leest `communities` / `community_members`.
- `docs/SQL_ADMIN_COMMUNITY_BEHEER_READ.sql` — admin leest o.a. `community_posts`, `community_shop_items`, `projects`.
- `docs/SQL_FIX_USER_CAUSE_QUIZ_ADMIN_READ_FILTER.sql` — quiz in admin + filteren.

---

## Nog te controleren / te doen (productie)

1. **Deploy** van gewijzigde functions: minstens `send-email` en `mollie-webhook` na de laatste code.
2. **Secrets** (Supabase → Edge Functions): `RESEND_API_KEY`, `EMAIL_FROM`; Mollie-secrets op payment/webhook.
3. **Korte test:** testmail in admin e-mail sectie, testbetaling, vrijwilliger goedkeuren, registratie-welcome.
4. **Roadmap** voor verdere Fase 2: zie `docs/ADMIN_LIVE_PLAN.md` (o.a. goede doelen-beheer, branding, homepage, meldingen).

---

## Belangrijkste code-paden

- Admin data/logica: `src/features/admin/adminContentService.ts`
- Admin secties: `src/pages/admin/portal/sections/Admin*.tsx`
- Edge invoke mail: `src/services/edgeFunctions.ts`
- Webhook: `supabase/functions/mollie-webhook/index.ts`, `supabase/functions/send-email/index.ts`

---

## Chatgeschiedenis in Cursor

Cursor bewaart chats meestal in het zijpaneel, maar **geen 100% garantie**. Deze file is de **vaste back-up van de context** in het project.
