# Eerste inventarisatie legacy bestand

Bronbestand: `C:\Users\Bryce\Downloads\index.html`

## Gevonden integraties
- Supabase SDK script tag en client initialisatie
- Verificatie via Supabase Edge Function voor admin login
- Donatie schrijf-/update-acties naar Supabase tabellen
- Resend configuratievelden en mailflow verwijzingen
- Mollie configuratievelden (live/test key, profile id) en betaalflow placeholders

## Reeds gemigreerd naar React
- Legacy `doLogin` vertaald naar `loginWithPassword()` in `src/features/auth/authService.ts`
- Legacy admin edge login (`/functions/v1/admin-login`) vertaald naar `adminLogin()`
- Legacy `doRegister` (individu) vertaald naar `registerIndividual()` inclusief `profiles` upsert
- Eerste testpagina voor beide flows toegevoegd in `src/pages/AuthPage.tsx`

## Belangrijke observatie
- Het bestand bevat veel inline JavaScript en inline configuratie.
- Voor React migratie is een gefaseerde opsplitsing naar `features` nodig (auth, payments, dashboard, admin).

## Veiligheidsactie aanbevolen
- In het legacy bestand staat een zichtbare Supabase anon key in plaintext.
- Gebruik in productie alleen env vars en roteer de sleutel als die publiek gedeeld is.

## Volgende concrete actie
- Legacy script opdelen in losse modules:
  - `features/auth`
  - `features/donations`
  - `features/admin`
  - `features/payments`
