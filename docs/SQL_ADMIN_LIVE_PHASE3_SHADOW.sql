-- ============================================================
-- Donatie.eu — Admin Phase 3 (Actieve sessies + shadow snapshot)
-- Idempotent. Draai na phase1/phase2/phase2b.
-- ============================================================

create or replace function public.admin_get_user_shadow_snapshot(
  p_user_id uuid,
  p_donation_limit integer default 20
)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_profile jsonb;
  v_donations jsonb := '[]'::jsonb;
  v_memberships jsonb := '[]'::jsonb;
  v_owned jsonb := '[]'::jsonb;
  v_session jsonb;
  v_grant jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  select to_jsonb(g)
    into v_grant
  from public.admin_shadow_grants g
  where g.user_id = p_user_id;

  if coalesce((v_grant->>'granted')::boolean, false) is false then
    raise exception 'shadow_not_granted';
  end if;

  select to_jsonb(p)
    into v_profile
  from public.profiles p
  where p.id = p_user_id;

  if v_profile is null then
    raise exception 'user_not_found';
  end if;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb)
    into v_donations
  from (
    select
      id,
      created_at,
      paid_at,
      refunded_at,
      amount,
      status,
      payment_method,
      charity_name,
      donor_name,
      donor_email,
      project_id,
      type
    from public.donations
    where donor_user_id = p_user_id or donor_id = p_user_id
    order by created_at desc
    limit greatest(coalesce(p_donation_limit, 20), 1)
  ) d;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.joined_at desc), '[]'::jsonb)
    into v_memberships
  from (
    select
      cm.community_id,
      cm.role,
      cm.joined_at,
      c.name,
      c.kind,
      c.join_code,
      c.slug
    from public.community_members cm
    join public.communities c on c.id = cm.community_id
    where cm.user_id = p_user_id
    order by cm.joined_at desc
  ) m;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
    into v_owned
  from (
    select
      c.id,
      c.name,
      c.kind,
      c.join_code,
      c.slug,
      c.created_at,
      c.updated_at
    from public.communities c
    where c.owner_user_id = p_user_id
    order by c.created_at desc
  ) o;

  select to_jsonb(s)
    into v_session
  from public.active_sessions s
  where s.user_id = p_user_id;

  return json_build_object(
    'profile', v_profile,
    'shadow_grant', coalesce(v_grant, '{}'::jsonb),
    'active_session', coalesce(v_session, '{}'::jsonb),
    'donations', coalesce(v_donations, '[]'::jsonb),
    'community_memberships', coalesce(v_memberships, '[]'::jsonb),
    'owned_communities', coalesce(v_owned, '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.admin_get_user_shadow_snapshot(uuid, integer) from public;
grant execute on function public.admin_get_user_shadow_snapshot(uuid, integer) to authenticated;