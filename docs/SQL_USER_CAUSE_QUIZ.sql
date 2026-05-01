-- Eénmalige doelen-quiz per gebruiker, marketing/admin lookups.
-- Voer in Supabase SQL Editor na profile/admin RPC’s (o.a. is_platform_admin, admin_search_users bestaat).
-- Realtime: optioneel: alter publication supabase_realtime add table public.user_cause_quiz;

begin;

create table if not exists public.user_cause_quiz (
  user_id uuid not null
    primary key
    references auth.users (id) on delete cascade,
  completed_at timestamptz not null default now(),
  answers jsonb not null default '{}',
  ranked_cause_ids integer[] not null default '{}',
  primary_filter text not null default 'alle',
  created_at timestamptz not null default now()
);

create index if not exists idx_user_cause_quiz_ranked on public.user_cause_quiz using gin (ranked_cause_ids);
create index if not exists idx_user_cause_quiz_completed on public.user_cause_quiz (completed_at desc);

comment on table public.user_cause_quiz is
  'Eén resultaat per gebruiker: uitslag persoonlijkheids-quiz (marketing / push-audience).';

alter table public.user_cause_quiz enable row level security;

create policy ucq_select_own
  on public.user_cause_quiz for select
  to authenticated
  using (auth.uid() = user_id);

-- Alleen de eerste insert voor deze gebruiker.
create policy ucq_insert_once
  on public.user_cause_quiz for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.user_cause_quiz x where x.user_id = auth.uid()
    )
  );

-- Geen wijzigen/verwijderen via client (immutabel); admin leest via RPC.
revoke all on public.user_cause_quiz from public;
grant select on public.user_cause_quiz to authenticated;
grant insert on public.user_cause_quiz to authenticated;

-- ——— Admin: uitslag per profiel (volledige JSON-rij)
create or replace function public.admin_get_user_cause_quiz(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  j jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  select to_jsonb(uq) into j
  from public.user_cause_quiz uq
  where uq.user_id = p_user_id;

  return j;
end;
$$;

-- ——— Admin: alle gebruikers die cause_id in hun top-10 (ranking) hadden
create or replace function public.admin_list_users_by_quiz_cause(
  p_cause_id integer
)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  account_type text,
  points integer,
  total_donated numeric,
  completed_at timestamptz,
  rank_in_quiz int
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    p.id,
    coalesce(p.email, au.email::text),
    p.first_name,
    p.last_name,
    p.account_type,
    coalesce(p.points, 0),
    coalesce(p.total_donated, 0),
    uq.completed_at,
    (array_position(uq.ranked_cause_ids, p_cause_id))::int
  from public.user_cause_quiz uq
  join public.profiles p on p.id = uq.user_id
  left join auth.users au on au.id = p.id
  where p_cause_id = any(uq.ranked_cause_ids)
  order by uq.completed_at desc nulls last;
end;
$$;

revoke all on function public.admin_get_user_cause_quiz(uuid) from public;
grant execute on function public.admin_get_user_cause_quiz(uuid) to authenticated;

revoke all on function public.admin_list_users_by_quiz_cause(integer) from public;
grant execute on function public.admin_list_users_by_quiz_cause(integer) to authenticated;

-- ——— Uitbreiding admin_search_users: quiz-timestamp
drop function if exists public.admin_search_users(text, integer, integer);

create or replace function public.admin_search_users(
  p_query text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  account_type text,
  is_volunteer boolean,
  is_admin boolean,
  points integer,
  total_donated numeric,
  created_at timestamptz,
  quiz_completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  q text;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  q := '%' || coalesce(trim(p_query), '') || '%';

  return query
  select
    p.id,
    coalesce(p.email, au.email::text),
    p.first_name,
    p.last_name,
    p.account_type,
    coalesce(p.is_volunteer, false),
    coalesce(p.is_admin, false),
    coalesce(p.points, 0),
    coalesce(p.total_donated, 0),
    au.created_at,
    uq.completed_at
  from public.profiles p
  left join auth.users au on au.id = p.id
  left join public.user_cause_quiz uq on uq.user_id = p.id
  where
    (coalesce(p.email,'') ilike q
     or coalesce(p.first_name,'') ilike q
     or coalesce(p.last_name,'') ilike q
     or coalesce(p.company_name,'') ilike q
     or coalesce(p.influencer_name,'') ilike q)
    or au.email ilike q
  order by au.created_at desc nulls last
  limit greatest(p_limit, 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_search_users(text, integer, integer) from public;
grant execute on function public.admin_search_users(text, integer, integer) to authenticated;

-- Optioneel: realtime updates in admin (Gebruikersoverzicht) na nieuwe quiz
-- alter publication supabase_realtime add table public.user_cause_quiz;

-- Na deploy: draai ook `docs/SQL_FIX_USER_CAUSE_QUIZ_ADMIN_READ_FILTER.sql` zodat:
-- 1) platform-admins user_cause_quiz kunnen lezen (RLS) → quiz zichtbaar in gebruikersoverzicht;
-- 2) admin_search_users filter op doel-ids in quiz kan.

commit;
