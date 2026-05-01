-- ============================================================
-- Community-punten: pending / active / cancelled
-- Zelfde flow als reguliere donor-points; safe bij Mollie-refund
-- Voer uit NA SQL_COMMUNITY_POINTS_AND_REDEMPTIONS.sql
-- ============================================================

-- 1) donations: extra kolommen voor community-puntenlevencyclus
alter table public.donations
  add column if not exists donor_community_points_status text,
  add column if not exists donor_community_points_eligible_at timestamptz,
  add column if not exists donor_community_points_activated_at timestamptz,
  add column if not exists donor_community_points_cancelled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'donations_donor_community_points_status_check'
  ) then
    alter table public.donations
      add constraint donations_donor_community_points_status_check
      check (
        donor_community_points_status is null
        or donor_community_points_status in ('pending', 'active', 'cancelled')
      );
  end if;
end $$;

create index if not exists idx_donations_donor_cp_status on public.donations (donor_community_points_status);
create index if not exists idx_donations_donor_cp_eligible on public.donations (donor_community_points_eligible_at);

-- 2) Helper: bereken wanneer community-punten "rijp" zijn (72u standaard, 60 dagen bij maandelijks).
create or replace function public.community_points_eligible_at_for(
  p_paid_at timestamptz,
  p_type text
)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_type = 'maandelijks' then coalesce(p_paid_at, now()) + interval '60 days'
    else coalesce(p_paid_at, now()) + interval '72 hours'
  end;
$$;

-- 3) Trigger: bij paid donation naar community-project markeren als PENDING;
--    bij refund → cancelled (en evt. aftrek als al active);
--    NIET direct punten toevoegen (activatie gebeurt via activate RPC / cron).
create or replace function public.apply_donor_community_points_on_donation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm uuid;
  v_donor uuid;
  v_type text;
  v_pts int;
  v_eligible_at timestamptz;
begin
  -- REFUND / CHARGEBACK
  if new.status = 'refunded'
     and old.status = 'paid'
     and old.donor_community_points_status in ('pending', 'active') then
    v_donor := public.donation_donor_user(old);
    if old.donor_community_points_status = 'active'
       and v_donor is not null
       and coalesce(old.donor_community_points_awarded, 0) > 0 then
      update public.profiles p
      set community_points = greatest(0, coalesce(p.community_points, 0) - old.donor_community_points_awarded)
      where p.id = v_donor;
    end if;
    new.donor_community_points_status := 'cancelled';
    new.donor_community_points_cancelled_at := now();
    return new;
  end if;

  -- Nieuwe paid: punten reserveren als pending
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;
  if new.project_id is null then
    return new;
  end if;

  select pr.community_id into v_comm
  from public.projects pr
  where pr.id = new.project_id;

  if v_comm is null then
    return new;
  end if;

  v_donor := public.donation_donor_user(new);
  if v_donor is null then
    return new;
  end if;

  -- Al eerder verwerkt? Dan niets doen.
  if new.donor_community_points_status is not null then
    return new;
  end if;

  v_type := coalesce(new.type, (new.metadata ->> 'donation_type'), 'eenmalig');
  v_pts := public.calc_donor_points_from_donation(new.amount, new.points_value, v_type);
  if v_pts <= 0 then
    return new;
  end if;

  v_eligible_at := public.community_points_eligible_at_for(now(), v_type);

  new.donor_community_points_awarded := v_pts;
  new.donor_community_points_status := 'pending';
  new.donor_community_points_eligible_at := v_eligible_at;
  -- Punten worden NIET direct toegevoegd; dat gebeurt bij activate_pending_community_points.
  return new;
end;
$$;

drop trigger if exists trg_donations_donor_community_points on public.donations;
create trigger trg_donations_donor_community_points
  before update of status, project_id
  on public.donations
  for each row
  execute function public.apply_donor_community_points_on_donation();

-- 4) Eenmalige backfill: zet status 'active' voor oude al-toegekende punten zodat ze niet opnieuw worden uitgedeeld.
update public.donations
set donor_community_points_status = 'active',
    donor_community_points_activated_at = coalesce(donor_community_points_activated_at, now())
where donor_community_points_awarded is not null
  and donor_community_points_awarded > 0
  and donor_community_points_status is null
  and status = 'paid';

-- 5) RPC: eigen pending punten activeren (puntenklaar + donatie nog 'paid')
create or replace function public.activate_my_pending_community_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total int := 0;
  v_rows int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  with candidates as (
    select d.id, d.donor_community_points_awarded
    from public.donations d
    where public.donation_donor_user(d) = v_uid
      and d.status = 'paid'
      and d.donor_community_points_status = 'pending'
      and (d.donor_community_points_eligible_at is null
           or d.donor_community_points_eligible_at <= now())
  ),
  upd as (
    update public.donations d
    set donor_community_points_status = 'active',
        donor_community_points_activated_at = now()
    from candidates c
    where d.id = c.id
    returning c.donor_community_points_awarded
  )
  select coalesce(sum(donor_community_points_awarded), 0), count(*)
  into v_total, v_rows
  from upd;

  if v_total > 0 then
    update public.profiles
    set community_points = coalesce(community_points, 0) + v_total,
        updated_at = now()
    where id = v_uid;
  end if;

  return jsonb_build_object('ok', true, 'activated', v_rows, 'points_added', v_total);
end;
$$;

revoke all on function public.activate_my_pending_community_points() from public;
grant execute on function public.activate_my_pending_community_points() to authenticated;

-- 6) RPC: pending community-points saldo ophalen (handig voor UI)
create or replace function public.get_my_pending_community_points()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(d.donor_community_points_awarded), 0)::int
  from public.donations d
  where public.donation_donor_user(d) = auth.uid()
    and d.status = 'paid'
    and d.donor_community_points_status = 'pending';
$$;

revoke all on function public.get_my_pending_community_points() from public;
grant execute on function public.get_my_pending_community_points() to authenticated;

-- 7) Optioneel cron-vriendelijke service-role RPC (als je pg_cron gebruikt)
create or replace function public.activate_all_pending_community_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_rows int := 0;
begin
  with candidates as (
    select d.id, public.donation_donor_user(d) as uid, d.donor_community_points_awarded
    from public.donations d
    where d.status = 'paid'
      and d.donor_community_points_status = 'pending'
      and (d.donor_community_points_eligible_at is null
           or d.donor_community_points_eligible_at <= now())
  ),
  upd as (
    update public.donations d
    set donor_community_points_status = 'active',
        donor_community_points_activated_at = now()
    from candidates c
    where d.id = c.id
    returning c.uid, c.donor_community_points_awarded
  ),
  per_user as (
    select uid, sum(donor_community_points_awarded) as total
    from upd
    group by uid
  ),
  apply as (
    update public.profiles p
    set community_points = coalesce(p.community_points, 0) + pu.total,
        updated_at = now()
    from per_user pu
    where p.id = pu.uid
    returning 1
  )
  select coalesce(sum(donor_community_points_awarded), 0), count(*)
  into v_total, v_rows
  from upd;

  return jsonb_build_object('ok', true, 'activated', v_rows, 'points_added', v_total);
end;
$$;

revoke all on function public.activate_all_pending_community_points() from public;
grant execute on function public.activate_all_pending_community_points() to service_role;
