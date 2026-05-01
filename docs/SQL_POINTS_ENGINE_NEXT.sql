-- Provider-onafhankelijke points engine voorbereiding
-- Doel: pending punten na donation 'paid', actief na timer, cancel bij refund.

-- 1) Voeg expliciete puntenkolommen toe zodat we niet alleen op metadata leunen.
alter table public.donations
  add column if not exists points_status text default 'pending',
  add column if not exists points_eligible_at timestamptz,
  add column if not exists points_awarded_at timestamptz,
  add column if not exists points_cancelled_at timestamptz,
  add column if not exists points_value integer;

-- 2) Beperk geldige statussen
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'donations_points_status_check'
  ) then
    alter table public.donations
      add constraint donations_points_status_check
      check (points_status in ('pending', 'active', 'cancelled'));
  end if;
end $$;

-- 3) Indexen voor cron/jobs
create index if not exists idx_donations_points_status on public.donations(points_status);
create index if not exists idx_donations_points_eligible_at on public.donations(points_eligible_at);

-- 4) Voorbeeld cron query (activeer punten die rijp zijn en nog paid zijn)
-- update public.donations
-- set points_status = 'active',
--     points_awarded_at = now()
-- where points_status = 'pending'
--   and status = 'paid'
--   and points_eligible_at <= now();

-- 5) Voorbeeld refund-cancel query
-- update public.donations
-- set points_status = 'cancelled',
--     points_cancelled_at = now()
-- where status = 'refunded'
--   and points_status in ('pending', 'active');
