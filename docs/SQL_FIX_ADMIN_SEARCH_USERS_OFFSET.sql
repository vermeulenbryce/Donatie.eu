-- Voegt p_offset toe aan admin_search_users (paginatie Gebruikersoverzicht).
-- Veilig: dropt de oude 2-argument-versie en vervangt door één functie met defaults.
-- Voer na SQL_ADMIN_LIVE_PHASE2 (of SQL_FIX_REALTIME_PUBLICATIE) uit in Supabase.

begin;

drop function if exists public.admin_search_users(text, integer);

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
  created_at timestamptz
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
    au.created_at
  from public.profiles p
  left join auth.users au on au.id = p.id
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

commit;
