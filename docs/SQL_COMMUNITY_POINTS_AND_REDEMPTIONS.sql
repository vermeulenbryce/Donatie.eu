-- ============================================================
-- Community-punten + inwisselingen
-- Uitvoeren na de eerdere community-migraties.
-- ============================================================

-- 1) profiles: community_points en woongegevens
alter table public.profiles add column if not exists community_points integer not null default 0;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists postal_code text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists country text;

-- 2) Donations: markering of community-punten al zijn toegekend aan de donor
alter table public.donations
  add column if not exists donor_community_points_awarded integer;

-- 3) Trigger: bij paid donation naar een community-project krijgt de donor community-punten
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
begin
  -- Terugdraaien bij refund
  if new.status = 'refunded'
     and old.status = 'paid'
     and coalesce(old.donor_community_points_awarded, 0) > 0 then
    v_donor := public.donation_donor_user(old);
    if v_donor is not null then
      update public.profiles p
      set community_points = greatest(0, coalesce(p.community_points, 0) - old.donor_community_points_awarded)
      where p.id = v_donor;
    end if;
    new.donor_community_points_awarded := null;
    return new;
  end if;

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

  if coalesce(new.donor_community_points_awarded, 0) <> 0 then
    return new;
  end if;

  v_type := coalesce(new.type, (new.metadata ->> 'donation_type'), 'eenmalig');
  v_pts := public.calc_donor_points_from_donation(new.amount, new.points_value, v_type);

  if v_pts <= 0 then
    return new;
  end if;

  update public.profiles p
  set community_points = coalesce(p.community_points, 0) + v_pts
  where p.id = v_donor;

  new.donor_community_points_awarded := v_pts;
  return new;
end;
$$;

drop trigger if exists trg_donations_donor_community_points on public.donations;
create trigger trg_donations_donor_community_points
  before update of status, project_id
  on public.donations
  for each row
  execute function public.apply_donor_community_points_on_donation();

-- 4) RPC: eigen profiel-woongegevens bijwerken
create or replace function public.update_my_profile_address(
  p_address text default null,
  p_postal_code text default null,
  p_city text default null,
  p_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update public.profiles
  set
    address = coalesce(nullif(trim(p_address), ''), address),
    postal_code = coalesce(nullif(trim(p_postal_code), ''), postal_code),
    city = coalesce(nullif(trim(p_city), ''), city),
    country = coalesce(nullif(trim(p_country), ''), country),
    updated_at = now()
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_my_profile_address(text, text, text, text) from public;
grant execute on function public.update_my_profile_address(text, text, text, text) to authenticated;

-- 5) Tabel voor inwisselingen
create table if not exists public.community_shop_redemptions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  shop_item_id uuid not null references public.community_shop_items (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cost_points integer not null check (cost_points >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  notes text
);

create index if not exists idx_community_shop_redemptions_community
  on public.community_shop_redemptions (community_id, created_at desc);
create index if not exists idx_community_shop_redemptions_user
  on public.community_shop_redemptions (user_id);

alter table public.community_shop_redemptions enable row level security;

-- Gebruiker ziet zijn eigen inwisselingen; eigenaar ziet alle inwisselingen in zijn community.
drop policy if exists community_shop_redemptions_select on public.community_shop_redemptions;
create policy community_shop_redemptions_select
  on public.community_shop_redemptions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_community_owner_uid(community_id, auth.uid())
  );

-- Alleen via RPC (security definer) wordt er geschreven; directe insert/update/delete niet toegestaan.

-- 6) RPC: item inwisselen (deducts community_points, verlaagt stock, maakt redemption aan)
create or replace function public.redeem_community_shop_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item record;
  v_is_member boolean;
  v_current_points int;
  v_redemption_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_item from public.community_shop_items where id = p_item_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'item_not_found');
  end if;

  if not v_item.active then
    return jsonb_build_object('ok', false, 'error', 'item_inactive');
  end if;

  if v_item.stock <= 0 then
    return jsonb_build_object('ok', false, 'error', 'out_of_stock');
  end if;

  -- Moet lid, sponsor of eigenaar zijn
  v_is_member := public.is_community_member_uid(v_item.community_id, v_uid)
                 or public.is_community_owner_uid(v_item.community_id, v_uid);
  if not v_is_member then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  select coalesce(community_points, 0) into v_current_points
  from public.profiles
  where id = v_uid;

  if v_current_points < v_item.cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points',
      'have', v_current_points, 'need', v_item.cost);
  end if;

  -- Deduct punten, verlaag stock, insert redemption (atomair in 1 tx)
  update public.profiles
  set community_points = community_points - v_item.cost,
      updated_at = now()
  where id = v_uid;

  update public.community_shop_items
  set stock = stock - 1
  where id = v_item.id and stock > 0;

  insert into public.community_shop_redemptions (community_id, shop_item_id, user_id, cost_points, status)
  values (v_item.community_id, v_item.id, v_uid, v_item.cost, 'pending')
  returning id into v_redemption_id;

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id,
    'remaining_points', v_current_points - v_item.cost);
end;
$$;

revoke all on function public.redeem_community_shop_item(uuid) from public;
grant execute on function public.redeem_community_shop_item(uuid) to authenticated;

-- 7) RPC: eigenaar bevestigt of annuleert een inwisseling
create or replace function public.confirm_community_redemption(
  p_redemption_id uuid,
  p_confirmed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_red record;
  v_owner uuid;
  v_new_status text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_red from public.community_shop_redemptions where id = p_redemption_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'redemption_not_found');
  end if;

  select owner_user_id into v_owner from public.communities where id = v_red.community_id;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'community_not_found');
  end if;
  if v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  v_new_status := case when p_confirmed then 'confirmed' else 'cancelled' end;

  -- Bij annuleren: punten & stock terugzetten
  if v_new_status = 'cancelled' and v_red.status <> 'cancelled' then
    update public.profiles
    set community_points = coalesce(community_points, 0) + v_red.cost_points
    where id = v_red.user_id;
    update public.community_shop_items
    set stock = stock + 1
    where id = v_red.shop_item_id;
  end if;

  update public.community_shop_redemptions
  set status = v_new_status,
      confirmed_at = case when p_confirmed then now() else null end
  where id = p_redemption_id;

  return jsonb_build_object('ok', true, 'status', v_new_status);
end;
$$;

revoke all on function public.confirm_community_redemption(uuid, boolean) from public;
grant execute on function public.confirm_community_redemption(uuid, boolean) to authenticated;

-- 8) RPC: lijst van inwisselingen met woongegevens (alleen voor eigenaar)
create or replace function public.list_community_redemptions_for_owner(
  p_community_id uuid,
  p_include_cancelled boolean default false
)
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
    r.id as redemption_id,
    r.user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.address,
    p.postal_code,
    p.city,
    p.country,
    r.shop_item_id,
    i.title as item_title,
    i.emoji as item_emoji,
    r.cost_points,
    r.status,
    r.created_at,
    r.confirmed_at
  from public.community_shop_redemptions r
  join public.communities co on co.id = r.community_id
  join public.community_shop_items i on i.id = r.shop_item_id
  left join public.profiles p on p.id = r.user_id
  where r.community_id = p_community_id
    and co.owner_user_id = auth.uid()
    and (p_include_cancelled or r.status <> 'cancelled')
  order by r.created_at desc;
$$;

revoke all on function public.list_community_redemptions_for_owner(uuid, boolean) from public;
grant execute on function public.list_community_redemptions_for_owner(uuid, boolean) to authenticated;

-- 9) RPC: eigen community-punten ophalen (voor UI die niet uit shell kan lezen)
create or replace function public.get_my_community_points()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(community_points, 0)
  from public.profiles
  where id = auth.uid();
$$;

revoke all on function public.get_my_community_points() from public;
grant execute on function public.get_my_community_points() to authenticated;

-- 10) Realtime (optioneel) voor redemptions
do $$
begin
  if to_regclass('public.community_shop_redemptions') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'community_shop_redemptions'
     )
  then
    alter publication supabase_realtime add table public.community_shop_redemptions;
  end if;
end $$;
