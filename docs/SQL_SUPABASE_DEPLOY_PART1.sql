-- DEEL 1 VAN 2 — Voer eerst dit hele bestand uit in Supabase SQL Editor. Daarna DEEL 2.
-- ============================================================
-- Communities voor bedrijf & influencer + leden + projecten + punten
-- Idempotent waar mogelijk - Supabase / PostgreSQL 15+
--
-- Vereisten in je schema (zoals in de React-app):
--   public.profiles (id uuid PK, account_type text, points, ...)
--   public.projects (id, owner_id, ...)
--   public.donations (status, amount, donor_user_id of donor_id - zie hieronder)
--
-- Na deploy: vul optioneel public.site_charity_causes met cause_key uit je site.
-- App: zet bij community-projecten projects.community_id + charity_cause_key;
--      zet bij donaties donations.project_id wanneer er aan zo'n project gedoneerd wordt.
-- ============================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------
-- Helper: updated_at
-- --------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------
-- 1) Optionele catalogus goede doelen (vul met keys van je site / CBF)
-- --------------------------------------------------
create table if not exists public.site_charity_causes (
  cause_key text primary key,
  label text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.site_charity_causes enable row level security;

drop policy if exists site_charity_causes_select_all on public.site_charity_causes;
create policy site_charity_causes_select_all
  on public.site_charity_causes
  for select
  to anon, authenticated
  using (active = true);

-- --------------------------------------------------
-- 2) Communities
-- --------------------------------------------------
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('bedrijf', 'influencer')),
  join_code text not null,
  name text not null default 'Community',
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communities_owner_kind_unique unique (owner_user_id, kind)
);

drop trigger if exists trg_communities_updated_at on public.communities;
create trigger trg_communities_updated_at
  before update on public.communities
  for each row
  execute function public.set_updated_at();

create unique index if not exists idx_communities_join_code_upper
  on public.communities (upper(join_code));

create index if not exists idx_communities_owner on public.communities (owner_user_id);
create index if not exists idx_communities_kind on public.communities (kind);

-- --------------------------------------------------
-- 3) Leden
-- --------------------------------------------------
create table if not exists public.community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (community_id, user_id)
);

create index if not exists idx_community_members_user on public.community_members (user_id);
create index if not exists idx_community_members_community on public.community_members (community_id);

-- --------------------------------------------------
-- 4) Projects uitbreiden (posts trigger komt na alter projects)
-- --------------------------------------------------
alter table public.projects
  add column if not exists community_id uuid references public.communities (id) on delete set null;

alter table public.projects
  add column if not exists charity_cause_key text;

alter table public.projects
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'members_only'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_community_charity_ck'
  ) then
    alter table public.projects
      add constraint projects_community_charity_ck
      check (community_id is null or charity_cause_key is not null);
  end if;
end $$;

create index if not exists idx_projects_community on public.projects (community_id);

-- --------------------------------------------------
-- Donations: kolommen voor community-flow (voor functies op public.donations)
-- --------------------------------------------------
alter table public.donations
  add column if not exists donor_user_id uuid references public.profiles (id) on delete set null;

alter table public.donations
  add column if not exists donor_id uuid references public.profiles (id) on delete set null;

alter table public.donations
  add column if not exists points_value integer;

alter table public.donations
  add column if not exists project_id uuid references public.projects (id) on delete set null;

alter table public.donations
  add column if not exists community_owner_points_awarded int;

-- --------------------------------------------------
-- 5) Community posts (na projects.community_id)
-- --------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  project_id uuid null references public.projects (id) on delete set null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);

create index if not exists idx_community_posts_community on public.community_posts (community_id, created_at desc);
create index if not exists idx_community_posts_project on public.community_posts (project_id, created_at desc);

-- --------------------------------------------------
-- 6) Punten donor -> helft voor community-eigenaar
-- --------------------------------------------------
-- Puntenbasis donor (pas calc_donor_points_from_donation aan naar jullie echte regels)
create or replace function public.calc_donor_points_from_donation(
  p_amount numeric,
  p_points_value int,
  p_donation_type text
)
returns int
language sql
immutable
as $$
  select case
    when p_points_value is not null and p_points_value >= 0 then p_points_value
    else greatest(0, round(coalesce(p_amount, 0)::numeric)::int)
  end;
$$;

-- Genereer unieke join code
create or replace function public.generate_community_join_code(p_kind text)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_try text;
  n int := 0;
begin
  v_prefix := case p_kind
    when 'bedrijf' then 'BU'
    when 'influencer' then 'IN'
    else 'CM'
  end;

  loop
    v_try := v_prefix || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
    exit when not exists (select 1 from public.communities c where upper(c.join_code) = upper(v_try));
    n := n + 1;
    exit when n > 50;
  end loop;

  if n > 50 then
    raise exception 'kon geen unieke join_code genereren';
  end if;

  return v_try;
end;
$$;

-- Maak community + owner-lidmaatschap
create or replace function public.create_community_for_profile(
  p_user_id uuid,
  p_kind text,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_display text;
begin
  if p_kind not in ('bedrijf', 'influencer') then
    raise exception 'ongeldig community type';
  end if;

  if exists (select 1 from public.communities c where c.owner_user_id = p_user_id and c.kind = p_kind) then
    select c.id into v_id from public.communities c
    where c.owner_user_id = p_user_id and c.kind = p_kind
    limit 1;
    return v_id;
  end if;

  v_code := public.generate_community_join_code(p_kind);
  v_display := coalesce(nullif(trim(p_name), ''), 'Community');

  insert into public.communities (owner_user_id, kind, join_code, name)
  values (p_user_id, p_kind, v_code, v_display)
  returning id into v_id;

  insert into public.community_members (community_id, user_id, role)
  values (v_id, p_user_id, 'owner')
  on conflict (community_id, user_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.create_community_for_profile(uuid, text, text) from public;
grant execute on function public.create_community_for_profile(uuid, text, text) to service_role;

-- Trigger: nieuw bedrijf/influencer-profiel -> community
create or replace function public.trg_profiles_create_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_type in ('bedrijf', 'influencer') then
    perform public.create_community_for_profile(
      new.id,
      new.account_type::text,
      coalesce(new.first_name, 'Community')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_auto_community on public.profiles;
create trigger trg_profiles_auto_community
  after insert on public.profiles
  for each row
  execute function public.trg_profiles_create_community();

-- Ook als account_type later naar bedrijf/influencer wijzigt (zeldzaam)
create or replace function public.trg_profiles_create_community_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_type in ('bedrijf', 'influencer')
     and (old.account_type is distinct from new.account_type) then
    perform public.create_community_for_profile(
      new.id,
      new.account_type::text,
      coalesce(new.first_name, 'Community')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_auto_community_update on public.profiles;
create trigger trg_profiles_auto_community_update
  after update of account_type on public.profiles
  for each row
  execute function public.trg_profiles_create_community_update();

-- Backfill bestaande profielen
insert into public.communities (owner_user_id, kind, join_code, name)
select
  p.id,
  p.account_type::text,
  public.generate_community_join_code(p.account_type::text),
  coalesce(p.first_name, 'Community')
from public.profiles p
where p.account_type in ('bedrijf', 'influencer')
  and not exists (
    select 1 from public.communities c
    where c.owner_user_id = p.id and c.kind = p.account_type::text
  );

insert into public.community_members (community_id, user_id, role)
select c.id, c.owner_user_id, 'owner'
from public.communities c
where not exists (
  select 1 from public.community_members m
  where m.community_id = c.id and m.user_id = c.owner_user_id
);

-- Project: alleen eigenaar van community mag community_id zetten
create or replace function public.enforce_project_community_owner()
returns trigger
language plpgsql
as $$
declare
  v_owner uuid;
begin
  if new.community_id is null then
    return new;
  end if;

  select c.owner_user_id into v_owner
  from public.communities c
  where c.id = new.community_id;

  if v_owner is null then
    raise exception 'community niet gevonden';
  end if;

  if v_owner is distinct from new.owner_id then
    raise exception 'alleen de community-eigenaar kan dit project starten';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_community_owner on public.projects;
create trigger trg_projects_community_owner
  before insert or update of community_id, owner_id
  on public.projects
  for each row
  execute function public.enforce_project_community_owner();

-- Als site_charity_causes gevuld is: valideer key
create or replace function public.enforce_charity_cause_in_catalog()
returns trigger
language plpgsql
as $$
begin
  if new.community_id is null then
    return new;
  end if;

  if exists (select 1 from public.site_charity_causes limit 1) then
    if not exists (
      select 1 from public.site_charity_causes s
      where s.cause_key = new.charity_cause_key and s.active
    ) then
      raise exception 'ongeldig of inactief goed doel (charity_cause_key)';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_charity_catalog on public.projects;
create trigger trg_projects_charity_catalog
  before insert or update of community_id, charity_cause_key
  on public.projects
  for each row
  execute function public.enforce_charity_cause_in_catalog();

-- --------------------------------------------------
-- 7) Donatie -> helft punten voor community-eigenaar (als project_id -> community)
-- --------------------------------------------------
create or replace function public.donation_donor_user(p_row public.donations)
returns uuid
language sql
stable
as $$
  select coalesce(
    p_row.donor_user_id,
    p_row.donor_id
  );
$$;

create or replace function public.apply_community_owner_points_on_donation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_donor uuid;
  v_comm uuid;
  v_donor_points int;
  v_owner_bonus int;
  v_type text;
begin
  -- Terugdraaien bij refund
  if new.status = 'refunded'
     and old.status = 'paid'
     and coalesce(old.community_owner_points_awarded, 0) > 0 then
    update public.profiles p
    set points = greatest(0, coalesce(p.points, 0) - old.community_owner_points_awarded)
    where p.id = (
      select c.owner_user_id
      from public.projects pr
      join public.communities c on c.id = pr.community_id
      where pr.id = old.project_id
      limit 1
    );
    new.community_owner_points_awarded := null;
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

  select c.owner_user_id into v_owner
  from public.communities c
  where c.id = v_comm;

  if v_owner is null then
    return new;
  end if;

  v_donor := public.donation_donor_user(new);
  if v_donor is not null and v_donor = v_owner then
    return new;
  end if;

  if coalesce(new.community_owner_points_awarded, 0) <> 0 then
    return new;
  end if;

  v_type := coalesce(new.type, (new.metadata ->> 'donation_type'), 'eenmalig');

  v_donor_points := public.calc_donor_points_from_donation(
    new.amount,
    new.points_value,
    v_type
  );

  v_owner_bonus := greatest(0, v_donor_points / 2);

  if v_owner_bonus <= 0 then
    return new;
  end if;

  update public.profiles p
  set points = coalesce(p.points, 0) + v_owner_bonus
  where p.id = v_owner;

  new.community_owner_points_awarded := v_owner_bonus;
  return new;
end;
$$;

drop trigger if exists trg_donations_owner_points on public.donations;
create trigger trg_donations_owner_points
  before update of status, project_id
  on public.donations
  for each row
  execute function public.apply_community_owner_points_on_donation();