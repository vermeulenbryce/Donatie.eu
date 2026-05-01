-- Eenmalig: alle goede doelen in site_charity_causes op "zichtbaar" (active = true).
-- De admin-UI houdt per doel de aan/uit-functie; dit helpt na bulk-imports of testdata.
-- (Optioneel) Zelfde effect: knop "Alles op zichtbaar" op /admin/goededoelen

update public.site_charity_causes
set active = true
where active is distinct from true;
