-- ============================================================
-- Seed: default uitgelichte doelen van de legacy homepage naar DB.
-- Safe om herhaald te draaien (ON CONFLICT DO NOTHING).
-- Na uitvoer zie je in /admin/featured exact deze 3 doelen staan;
-- daarna kun je toevoegen/verwijderen via het admin paneel.
-- ============================================================

insert into public.site_featured_causes (cause_key, sort_order, active)
values
  ('cbf-4',  10, true),   -- KWF Kankerbestrijding
  ('cbf-19', 20, true),   -- Dierenbescherming
  ('cbf-7',  30, true)    -- Rode Kruis
on conflict (cause_key) do nothing;

select cause_key, sort_order, active
from public.site_featured_causes
order by sort_order;
