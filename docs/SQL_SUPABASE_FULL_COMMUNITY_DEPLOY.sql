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

-- --------------------------------------------------
-- 8) RPC: join met code (particulier)
-- --------------------------------------------------
create or replace function public.join_community_with_code(raw_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comm record;
  v_code text := upper(trim(raw_code));
  v_at text;
  v_meta_at text;
  v_mem_role text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select account_type::text into v_at from public.profiles where id = v_uid;

  if not found then
    insert into public.profiles (
      id,
      email,
      first_name,
      last_name,
      account_type,
      anonymous,
      updated_at
    )
    select
      au.id,
      au.email,
      nullif(trim(coalesce(au.raw_user_meta_data->>'first_name', '')), ''),
      nullif(trim(coalesce(au.raw_user_meta_data->>'last_name', '')), ''),
      case
        when lower(trim(coalesce(au.raw_user_meta_data->>'account_type', ''))) in ('bedrijf', 'influencer')
          then lower(trim(au.raw_user_meta_data->>'account_type'))
        else 'individu'
      end,
      case coalesce(au.raw_user_meta_data->>'anonymous', 'false')
        when 'true' then true
        else false
      end,
      now()
    from auth.users au
    where au.id = v_uid
    on conflict (id) do nothing;

    select account_type::text into v_at from public.profiles where id = v_uid;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'profile_not_found');
    end if;
  end if;

  v_at := lower(trim(coalesce(v_at, '')));
  if v_at in ('', 'individual') then
    v_at := 'individu';
  end if;

  select lower(trim(coalesce(au.raw_user_meta_data->>'account_type', '')))
  into v_meta_at
  from auth.users au
  where au.id = v_uid
  limit 1;

  if v_meta_at = 'individual' then
    v_meta_at := 'individu';
  end if;

  if v_at not in ('individu', 'bedrijf', 'influencer')
     and v_meta_at in ('individu', 'bedrijf', 'influencer') then
    update public.profiles
    set account_type = v_meta_at,
        updated_at = now()
    where id = v_uid;
    v_at := v_meta_at;
  end if;

  if v_at in ('bedrijf', 'influencer')
     and v_meta_at = 'individu'
     and not exists (
       select 1 from public.communities co where co.owner_user_id = v_uid
     ) then
    update public.profiles
    set account_type = 'individu',
        updated_at = now()
    where id = v_uid;
    v_at := 'individu';
  end if;

  if v_at in ('bedrijf', 'influencer') then
    return jsonb_build_object('ok', false, 'error', 'only_individuals_can_join');
  end if;

  select co.*
  into v_comm
  from public.communities co
  where upper(co.join_code) = v_code
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if v_comm.owner_user_id = v_uid and v_at = 'individu' then
    update public.profiles
    set account_type = v_comm.kind,
        updated_at = now()
    where id = v_uid;
    v_at := lower(trim(v_comm.kind::text));
  end if;

  select m.role::text into v_mem_role
  from public.community_members m
  where m.community_id = v_comm.id and m.user_id = v_uid
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'already_member', true,
      'community_id', v_comm.id,
      'membership_role', v_mem_role
    );
  end if;

  if v_comm.owner_user_id = v_uid then
    insert into public.community_members (community_id, user_id, role)
    values (v_comm.id, v_uid, 'owner')
    on conflict (community_id, user_id) do nothing;
    return jsonb_build_object(
      'ok', true,
      'already_member', true,
      'community_id', v_comm.id,
      'membership_role', 'owner',
      'owner_row_repaired', true
    );
  end if;

  if v_comm.kind = 'bedrijf' then
    if exists (
      select 1
      from public.community_members m
      join public.communities c2 on c2.id = m.community_id
      where m.user_id = v_uid and c2.kind = 'bedrijf'
    ) then
      return jsonb_build_object('ok', false, 'error', 'already_in_a_company_community');
    end if;
  end if;

  if v_comm.kind = 'influencer' then
    if (
      select count(*)::int
      from public.community_members m
      join public.communities c2 on c2.id = m.community_id
      where m.user_id = v_uid and c2.kind = 'influencer'
    ) >= 5 then
      return jsonb_build_object('ok', false, 'error', 'influencer_community_limit_5');
    end if;
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (v_comm.id, v_uid, 'member');

  return jsonb_build_object('ok', true, 'community_id', v_comm.id, 'kind', v_comm.kind);
end;
$$;

revoke all on function public.join_community_with_code(text) from public;
grant execute on function public.join_community_with_code(text) to authenticated;

drop trigger if exists trg_profiles_auto_community on public.profiles;
drop trigger if exists trg_profiles_auto_community_update on public.profiles;

-- RPC: communities waar auth gebruiker lid is (security definer - voorkomt lege lijst door RLS-subquery edge cases)
create or replace function public.list_my_community_memberships()
returns table (
  id uuid,
  owner_user_id uuid,
  kind text,
  join_code text,
  name text,
  slug text,
  role text
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.owner_user_id, c.kind, c.join_code, c.name, c.slug, m.role
  from public.community_members m
  join public.communities c on c.id = m.community_id
  where m.user_id = auth.uid()
  order by c.name;
$$;

revoke all on function public.list_my_community_memberships() from public;
grant execute on function public.list_my_community_memberships() to authenticated;

-- RPC: vanaf ranglijst - influencer user id = owner
create or replace function public.join_influencer_community_by_owner(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_uid uuid := auth.uid();
  v_at text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select account_type::text into v_at from public.profiles where id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_not_found');
  end if;

  v_at := lower(trim(coalesce(v_at, '')));
  if v_at in ('', 'individual') then
    v_at := 'individu';
  end if;

  if v_at in ('bedrijf', 'influencer') then
    return jsonb_build_object('ok', false, 'error', 'only_individuals_can_join');
  end if;

  select * into c
  from public.communities
  where owner_user_id = p_owner and kind = 'influencer'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'influencer_community_not_found');
  end if;

  return public.join_community_with_code(c.join_code);
end;
$$;

revoke all on function public.join_influencer_community_by_owner(uuid) from public;
grant execute on function public.join_influencer_community_by_owner(uuid) to authenticated;

-- Publieke discover (zonder join_code - die blijft alleen voor leden/eigenaar via RLS)
create or replace function public.list_public_influencer_communities()
returns table (
  id uuid,
  owner_user_id uuid,
  name text,
  slug text
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.owner_user_id, c.name, c.slug
  from public.communities c
  where c.kind = 'influencer';
$$;

revoke all on function public.list_public_influencer_communities() from public;
grant execute on function public.list_public_influencer_communities() to anon, authenticated;

-- --------------------------------------------------
-- 8b) RLS helpers — voorkomt "infinite recursion" tussen policies op communities en community_members
-- --------------------------------------------------
create or replace function public.is_community_owner_uid(p_community_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.communities c
    where c.id is not distinct from p_community_id
      and c.owner_user_id is not distinct from p_uid
  );
$$;

revoke all on function public.is_community_owner_uid(uuid, uuid) from public;
grant execute on function public.is_community_owner_uid(uuid, uuid) to authenticated;

create or replace function public.is_community_member_uid(p_community_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id is not distinct from p_community_id
      and m.user_id is not distinct from p_uid
  );
$$;

revoke all on function public.is_community_member_uid(uuid, uuid) from public;
grant execute on function public.is_community_member_uid(uuid, uuid) to authenticated;

create or replace function public.can_access_community_uid(p_community_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_community_owner_uid(p_community_id, p_uid)
      or public.is_community_member_uid(p_community_id, p_uid);
$$;

revoke all on function public.can_access_community_uid(uuid, uuid) from public;
grant execute on function public.can_access_community_uid(uuid, uuid) to authenticated;

-- --------------------------------------------------
-- 9) RLS
-- --------------------------------------------------
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_posts enable row level security;

drop policy if exists communities_select_public_influencer on public.communities;

drop policy if exists communities_select_member_or_owner on public.communities;
create policy communities_select_member_or_owner
  on public.communities
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_community_member_uid(communities.id, auth.uid())
  );

drop policy if exists communities_select_bedrijf_owner on public.communities;

drop policy if exists communities_update_owner on public.communities;
create policy communities_update_owner
  on public.communities
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists community_members_select_self on public.community_members;
create policy community_members_select_self
  on public.community_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_community_owner_uid(community_members.community_id, auth.uid())
  );

-- Inserts via RPC (security definer); geen directe insert policy voor leden

drop policy if exists community_posts_select_members on public.community_posts;
create policy community_posts_select_members
  on public.community_posts
  for select
  to authenticated
  using (
    public.can_access_community_uid(community_posts.community_id, auth.uid())
  );

drop policy if exists community_posts_insert_members on public.community_posts;
create policy community_posts_insert_members
  on public.community_posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.can_access_community_uid(community_posts.community_id, auth.uid())
  );

-- Publieke projecten van communities: iedereen mag lezen
drop policy if exists projects_select_public_community on public.projects;
create policy projects_select_public_community
  on public.projects
  for select
  to anon, authenticated
  using (
    community_id is not null
    and visibility = 'public'
    and lower(coalesce(status::text, '')) in ('actief', 'active')
  );

-- Communityleden (en eigenaar) mogen members_only-projecten van die community lezen
drop policy if exists projects_select_community_member on public.projects;
create policy projects_select_community_member
  on public.projects
  for select
  to authenticated
  using (
    community_id is not null
    and visibility = 'members_only'
    and (
      public.is_community_member_uid(projects.community_id, auth.uid())
      or public.is_community_owner_uid(projects.community_id, auth.uid())
    )
  );

-- --------------------------------------------------
-- 10) Realtime (optioneel)
-- --------------------------------------------------
do $$
begin
  if to_regclass('public.communities') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'communities'
     )
  then
    alter publication supabase_realtime add table public.communities;
  end if;

  if to_regclass('public.community_members') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'community_members'
     )
  then
    alter publication supabase_realtime add table public.community_members;
  end if;

  if to_regclass('public.community_posts') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'community_posts'
     )
  then
    alter publication supabase_realtime add table public.community_posts;
  end if;

  if to_regclass('public.projects') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'projects'
     )
  then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;

-- Patch: maak gegarandeerd een eigen community aan vanuit frontend
-- Vereist dat SQL_COMMUNITIES_BEDRIJF_INFLUENCER.sql al is gedraaid.

create or replace function public.ensure_my_community(raw_name text default null)
returns table (
  id uuid,
  owner_user_id uuid,
  kind text,
  join_code text,
  name text,
  slug text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_name text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select p.account_type::text, coalesce(nullif(trim(raw_name), ''), p.first_name, 'Community')
  into v_kind, v_name
  from public.profiles p
  where p.id = v_uid
  limit 1;

  if not found then
    insert into public.profiles (
      id,
      email,
      first_name,
      last_name,
      account_type,
      anonymous,
      updated_at
    )
    select
      au.id,
      au.email,
      nullif(trim(coalesce(au.raw_user_meta_data->>'first_name', '')), ''),
      nullif(trim(coalesce(au.raw_user_meta_data->>'last_name', '')), ''),
      case
        when lower(trim(coalesce(au.raw_user_meta_data->>'account_type', ''))) in ('bedrijf', 'influencer')
          then lower(trim(au.raw_user_meta_data->>'account_type'))
        else 'individu'
      end,
      case coalesce(au.raw_user_meta_data->>'anonymous', 'false')
        when 'true' then true
        else false
      end,
      now()
    from auth.users au
    where au.id = v_uid
    on conflict (id) do nothing;

    select p.account_type::text, coalesce(nullif(trim(raw_name), ''), p.first_name, 'Community')
    into v_kind, v_name
    from public.profiles p
    where p.id = v_uid
    limit 1;

    if not found then
      raise exception 'profile_not_found';
    end if;
  end if;

  v_kind := lower(trim(coalesce(v_kind, '')));
  if v_kind in ('', 'individual') then
    v_kind := 'individu';
  end if;

  if v_kind not in ('bedrijf', 'influencer') then
    raise exception 'only_bedrijf_or_influencer_can_own_community';
  end if;

  v_id := public.create_community_for_profile(v_uid, v_kind, v_name);

  return query
  select c.id, c.owner_user_id, c.kind, c.join_code, c.name, c.slug
  from public.communities c
  where c.id = v_id
  limit 1;
end;
$$;

revoke all on function public.ensure_my_community(text) from public;
grant execute on function public.ensure_my_community(text) to authenticated;


-- Owner mag community-projecten aanmaken en status wijzigen (na communities-SQL).
-- Voer uit als inserts/updates op public.projects falen door RLS.

alter table public.projects enable row level security;

drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner
  on public.projects
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner
  on public.projects
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Optioneel: eigen projecten lezen (naast bestaande public community policy)
drop policy if exists projects_select_owner on public.projects;
create policy projects_select_owner
  on public.projects
  for select
  to authenticated
  using (owner_id = auth.uid());

-- --------------------------------------------------
-- 11) Profielen: lege / Engelse types repareren (geen handmatige UUID)
--     Zet account_type vanuit Supabase Auth metadata waar profiel ontbreekt of leeg is.
-- --------------------------------------------------
update public.profiles p
set
  account_type = case
    when coalesce(nullif(trim(lower(au.raw_user_meta_data->>'account_type')), ''), '') in ('bedrijf', 'influencer')
      then trim(lower(au.raw_user_meta_data->>'account_type'))
    else 'individu'
  end,
  updated_at = now()
from auth.users au
where au.id = p.id
  and (
    p.account_type is null
    or trim(lower(coalesce(p.account_type::text, ''))) = ''
    or trim(lower(p.account_type::text)) = 'individual'
  );
