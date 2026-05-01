-- Fix: platform-admin ziet quiz in joins/RPC omdat RLS anders alleen eigen user laat.
-- Uitbreiding: optioneel filteren op 1+ CBF doel-id in quiz top-10 (user_cause_quiz.ranked_cause_ids).
-- Voer na SQL_USER_CAUSE_QUIZ.sql.

begin;

-- Admins mogen alle quiz-rijen lezen (o.a. admin_search_users join + RPCs).
drop policy if exists ucq_select_platform_admin on public.user_cause_quiz;
create policy ucq_select_platform_admin
  on public.user_cause_quiz for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- Vervang admin_search_users met optionele p_filter_cause_ids (|| = snijpunt met array)

drop function if exists public.admin_search_users(text, integer, integer);

create or replace function public.admin_search_users(
  p_query text,
  p_limit integer default 20,
  p_offset integer default 0,
  p_filter_cause_ids integer[] default null
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
  use_filter boolean;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  q := '%' || coalesce(trim(p_query), '') || '%';
  use_filter := p_filter_cause_ids is not null and coalesce(array_length(p_filter_cause_ids, 1), 0) > 0;

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
     or coalesce(p.influencer_name,'') ilike q
     or au.email ilike q)
    and (
      not use_filter
      or exists (
        select 1
        from public.user_cause_quiz uqf
        where uqf.user_id = p.id
          and uqf.ranked_cause_ids && p_filter_cause_ids
      )
    )
  order by au.created_at desc nulls last
  limit greatest(p_limit, 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_search_users(text, integer, integer, integer[]) from public;
grant execute on function public.admin_search_users(text, integer, integer, integer[]) to authenticated;

commit;
