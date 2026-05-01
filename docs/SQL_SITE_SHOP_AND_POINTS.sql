-- ============================================================
-- Site-brede puntenwinkel + refund-veilige tracking voor normale donor-punten
-- ============================================================

-- 1) Platform-admin helper (gebruikt Supabase auth.users.raw_app_meta_data.role = 'admin').
-- Voorbeeld om in te stellen: update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role','admin') where email = 'admin@donatie.eu';
create or replace function public.is_platform_admin(p_uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from auth.users au
    where au.id = p_uid
      and coalesce(au.raw_app_meta_data->>'role', '') = 'admin'
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to anon, authenticated;

-- 2) Site-shop items
create table if not exists public.site_shop_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cost integer not null check (cost >= 0),
  stock integer not null default 0,
  emoji text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_site_shop_items_updated_at on public.site_shop_items;
create trigger trg_site_shop_items_updated_at
  before update on public.site_shop_items
  for each row
  execute function public.set_updated_at();

alter table public.site_shop_items enable row level security;

drop policy if exists site_shop_items_select on public.site_shop_items;
create policy site_shop_items_select
  on public.site_shop_items
  for select
  to anon, authenticated
  using (active or public.is_platform_admin(auth.uid()));

drop policy if exists site_shop_items_insert_admin on public.site_shop_items;
create policy site_shop_items_insert_admin
  on public.site_shop_items
  for insert
  to authenticated
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists site_shop_items_update_admin on public.site_shop_items;
create policy site_shop_items_update_admin
  on public.site_shop_items
  for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists site_shop_items_delete_admin on public.site_shop_items;
create policy site_shop_items_delete_admin
  on public.site_shop_items
  for delete
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- 3) Seed: huidige front-end items (voucher10, shirt, bonusdonatie). Safe bij opnieuw draaien.
insert into public.site_shop_items (title, description, cost, stock, emoji, active, sort_order)
select 'Bol.com voucher', 'Digitale voucher van EUR 10', 120, 999, '🎁', true, 10
where not exists (select 1 from public.site_shop_items where title = 'Bol.com voucher');

insert into public.site_shop_items (title, description, cost, stock, emoji, active, sort_order)
select 'Donatie.eu T-shirt', 'Merchandise met impact-print', 180, 999, '👕', true, 20
where not exists (select 1 from public.site_shop_items where title = 'Donatie.eu T-shirt');

insert into public.site_shop_items (title, description, cost, stock, emoji, active, sort_order)
select 'Extra donatieboost', 'Wij doneren EUR 5 extra namens jou', 250, 999, '💚', true, 30
where not exists (select 1 from public.site_shop_items where title = 'Extra donatieboost');

-- 4) Site-shop inwisselingen
create table if not exists public.site_shop_redemptions (
  id uuid primary key default gen_random_uuid(),
  shop_item_id uuid not null references public.site_shop_items (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cost_points integer not null check (cost_points >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  notes text
);
create index if not exists idx_site_shop_redemptions_user on public.site_shop_redemptions (user_id);
create index if not exists idx_site_shop_redemptions_status on public.site_shop_redemptions (status, created_at desc);

alter table public.site_shop_redemptions enable row level security;

drop policy if exists site_shop_redemptions_select on public.site_shop_redemptions;
create policy site_shop_redemptions_select
  on public.site_shop_redemptions
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

-- Inserts/updates gaan via security-definer RPC's, geen directe insert-policy nodig.

-- 5) RPC: redeem site-shop item (deducts profiles.points, creeert pending inwisseling)
create or replace function public.redeem_site_shop_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item record;
  v_current int;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_item from public.site_shop_items where id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'item_not_found');
  end if;
  if not v_item.active then
    return jsonb_build_object('ok', false, 'error', 'item_inactive');
  end if;
  if v_item.stock <= 0 then
    return jsonb_build_object('ok', false, 'error', 'out_of_stock');
  end if;

  select coalesce(points, 0) into v_current from public.profiles where id = v_uid;
  if v_current < v_item.cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points',
      'have', v_current, 'need', v_item.cost);
  end if;

  update public.profiles
  set points = points - v_item.cost,
      updated_at = now()
  where id = v_uid;

  update public.site_shop_items
  set stock = stock - 1
  where id = v_item.id and stock > 0;

  insert into public.site_shop_redemptions (shop_item_id, user_id, cost_points, status)
  values (v_item.id, v_uid, v_item.cost, 'pending')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'redemption_id', v_id,
    'remaining_points', v_current - v_item.cost
  );
end;
$$;

revoke all on function public.redeem_site_shop_item(uuid) from public;
grant execute on function public.redeem_site_shop_item(uuid) to authenticated;

-- 6) RPC: admin bevestigt of annuleert inwisseling
create or replace function public.confirm_site_shop_redemption(p_redemption_id uuid, p_confirmed boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_red record;
  v_new text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not public.is_platform_admin(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select * into v_red from public.site_shop_redemptions where id = p_redemption_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'redemption_not_found');
  end if;

  v_new := case when p_confirmed then 'confirmed' else 'cancelled' end;

  if v_new = 'cancelled' and v_red.status <> 'cancelled' then
    update public.profiles
    set points = coalesce(points, 0) + v_red.cost_points
    where id = v_red.user_id;
    update public.site_shop_items set stock = stock + 1 where id = v_red.shop_item_id;
  end if;

  update public.site_shop_redemptions
  set status = v_new,
      confirmed_at = case when p_confirmed then now() else null end
  where id = p_redemption_id;

  return jsonb_build_object('ok', true, 'status', v_new);
end;
$$;

revoke all on function public.confirm_site_shop_redemption(uuid, boolean) from public;
grant execute on function public.confirm_site_shop_redemption(uuid, boolean) to authenticated;

-- 7) RPC: lijst voor admin (incl. woongegevens)
create or replace function public.list_site_shop_redemptions_for_admin(p_include_cancelled boolean default false)
returns table (
  redemption_id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  address text,
  postal_code text,
  city text,
  country text,
  shop_item_id uuid,
  item_title text,
  item_emoji text,
  cost_points int,
  status text,
  created_at timestamptz,
  confirmed_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id, r.user_id, p.email, p.first_name, p.last_name,
    p.address, p.postal_code, p.city, p.country,
    r.shop_item_id, i.title, i.emoji,
    r.cost_points, r.status, r.created_at, r.confirmed_at
  from public.site_shop_redemptions r
  join public.site_shop_items i on i.id = r.shop_item_id
  left join public.profiles p on p.id = r.user_id
  where (p_include_cancelled or r.status <> 'cancelled')
    and public.is_platform_admin(auth.uid())
  order by r.created_at desc;
$$;

revoke all on function public.list_site_shop_redemptions_for_admin(boolean) from public;
grant execute on function public.list_site_shop_redemptions_for_admin(boolean) to authenticated;

-- 8) Realtime (optioneel)
do $$
begin
  if to_regclass('public.site_shop_items') is not null
     and not exists (
       select 1 from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relname = 'site_shop_items'
     )
  then alter publication supabase_realtime add table public.site_shop_items; end if;

  if to_regclass('public.site_shop_redemptions') is not null
     and not exists (
       select 1 from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relname = 'site_shop_redemptions'
     )
  then alter publication supabase_realtime add table public.site_shop_redemptions; end if;
end $$;

-- ============================================================
-- Deel B: refund-veilige tracking voor normale donor-punten
-- ============================================================

alter table public.donations
  add column if not exists donor_points_awarded integer,
  add column if not exists donor_points_status text,
  add column if not exists donor_points_eligible_at timestamptz,
  add column if not exists donor_points_activated_at timestamptz,
  add column if not exists donor_points_cancelled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'donations_donor_points_status_check'
  ) then
    alter table public.donations
      add constraint donations_donor_points_status_check
      check (
        donor_points_status is null
        or donor_points_status in ('pending', 'active', 'cancelled')
      );
  end if;
end $$;

create index if not exists idx_donations_donor_points_status on public.donations (donor_points_status);
create index if not exists idx_donations_donor_points_eligible on public.donations (donor_points_eligible_at);

-- Trigger: bij paid -> pending; bij refund -> cancelled (en aftrek bij active).
create or replace function public.apply_donor_points_on_donation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donor uuid;
  v_type text;
  v_pts int;
  v_eligible_at timestamptz;
begin
  if new.status = 'refunded'
     and old.status = 'paid'
     and old.donor_points_status in ('pending', 'active') then
    v_donor := public.donation_donor_user(old);
    if old.donor_points_status = 'active'
       and v_donor is not null
       and coalesce(old.donor_points_awarded, 0) > 0 then
      update public.profiles p
      set points = greatest(0, coalesce(p.points, 0) - old.donor_points_awarded)
      where p.id = v_donor;
    end if;
    new.donor_points_status := 'cancelled';
    new.donor_points_cancelled_at := now();
    return new;
  end if;

  if new.status <> 'paid' or old.status = 'paid' then return new; end if;

  v_donor := public.donation_donor_user(new);
  if v_donor is null then return new; end if;
  if new.donor_points_status is not null then return new; end if;

  v_type := coalesce(new.type, (new.metadata ->> 'donation_type'), 'eenmalig');
  v_pts := public.calc_donor_points_from_donation(new.amount, new.points_value, v_type);
  if v_pts <= 0 then return new; end if;

  v_eligible_at := public.community_points_eligible_at_for(now(), v_type);
  new.donor_points_awarded := v_pts;
  new.donor_points_status := 'pending';
  new.donor_points_eligible_at := v_eligible_at;
  return new;
end;
$$;

drop trigger if exists trg_donations_donor_points on public.donations;
create trigger trg_donations_donor_points
  before update of status on public.donations
  for each row
  execute function public.apply_donor_points_on_donation();

-- RPC: activeer eigen pending punten
create or replace function public.activate_my_pending_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_total int := 0; v_rows int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not_authenticated'); end if;
  with candidates as (
    select d.id, d.donor_points_awarded
    from public.donations d
    where public.donation_donor_user(d) = v_uid
      and d.status = 'paid'
      and d.donor_points_status = 'pending'
      and (d.donor_points_eligible_at is null or d.donor_points_eligible_at <= now())
  ),
  upd as (
    update public.donations d
    set donor_points_status = 'active', donor_points_activated_at = now()
    from candidates c where d.id = c.id
    returning c.donor_points_awarded
  )
  select coalesce(sum(donor_points_awarded),0), count(*) into v_total, v_rows from upd;
  if v_total > 0 then
    update public.profiles set points = coalesce(points,0) + v_total, updated_at = now()
    where id = v_uid;
  end if;
  return jsonb_build_object('ok', true, 'activated', v_rows, 'points_added', v_total);
end;
$$;
revoke all on function public.activate_my_pending_points() from public;
grant execute on function public.activate_my_pending_points() to authenticated;

create or replace function public.get_my_pending_points()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(d.donor_points_awarded), 0)::int
  from public.donations d
  where public.donation_donor_user(d) = auth.uid()
    and d.status = 'paid'
    and d.donor_points_status = 'pending';
$$;
revoke all on function public.get_my_pending_points() from public;
grant execute on function public.get_my_pending_points() to authenticated;

create or replace function public.activate_all_pending_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_total int := 0; v_rows int := 0;
begin
  with candidates as (
    select d.id, public.donation_donor_user(d) as uid, d.donor_points_awarded
    from public.donations d
    where d.status = 'paid'
      and d.donor_points_status = 'pending'
      and (d.donor_points_eligible_at is null or d.donor_points_eligible_at <= now())
  ),
  upd as (
    update public.donations d
    set donor_points_status = 'active', donor_points_activated_at = now()
    from candidates c where d.id = c.id
    returning c.uid, c.donor_points_awarded
  ),
  per_user as (select uid, sum(donor_points_awarded) as total from upd group by uid),
  apply as (
    update public.profiles p
    set points = coalesce(p.points, 0) + pu.total, updated_at = now()
    from per_user pu where p.id = pu.uid
    returning 1
  )
  select coalesce(sum(donor_points_awarded),0), count(*) into v_total, v_rows from upd;
  return jsonb_build_object('ok', true, 'activated', v_rows, 'points_added', v_total);
end;
$$;
revoke all on function public.activate_all_pending_points() from public;
grant execute on function public.activate_all_pending_points() to service_role;
