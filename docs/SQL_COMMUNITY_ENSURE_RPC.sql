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

  -- Geen profielrij (oude accounts / handmatige auth): aanmaken vanuit auth.users
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

  -- Zelfde normalisatie als join_community_with_code (hoofdletters, spaties, 'individual')
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

