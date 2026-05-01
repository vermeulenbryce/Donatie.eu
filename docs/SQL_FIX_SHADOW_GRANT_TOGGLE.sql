-- ============================================================
-- Fix: betrouwbare self-toggle voor admin_shadow_grants
-- Draai dit in Supabase SQL Editor.
-- ============================================================

create or replace function public.set_my_shadow_grant(p_granted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.admin_shadow_grants (user_id, granted, granted_at, revoked_at)
  values (
    v_uid,
    p_granted,
    case when p_granted then v_now else null end,
    case when p_granted then null else v_now end
  )
  on conflict (user_id) do update
    set granted = excluded.granted,
        granted_at = excluded.granted_at,
        revoked_at = excluded.revoked_at,
        updated_at = v_now;
end;
$$;

revoke all on function public.set_my_shadow_grant(boolean) from public;
grant execute on function public.set_my_shadow_grant(boolean) to authenticated;

-- Snelle check (moet bestaan)
select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name='set_my_shadow_grant';
