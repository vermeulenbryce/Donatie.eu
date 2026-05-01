-- DEEL 2 VAN 2 — Voer dit uit ná DEEL 1 (zelfde SQL Editor-sessie mag, of apart plakken).
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
      id, email, first_name, last_name, account_type, anonymous, updated_at
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
        when 'true' then true else false
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
    set account_type = v_meta_at, updated_at = now()
    where id = v_uid;
    v_at := v_meta_at;
  end if;

  if v_at in ('bedrijf', 'influencer')
     and v_meta_at = 'individu'
     and not exists (
       select 1 from public.communities co where co.owner_user_id = v_uid
     ) then
    update public.profiles
    set account_type = 'individu', updated_at = now()
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
    set account_type = v_comm.kind, updated_at = now()
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
