-- ============================================================
-- Profielfoto's (avatar_url) en project-afbeeldingen (image_url)
-- ============================================================

-- 1) Kolommen
alter table public.profiles add column if not exists avatar_url text;
alter table public.projects add column if not exists image_url text;

-- 2) RPC: eigen avatar bijwerken (null → verwijderen)
create or replace function public.update_my_avatar(p_avatar_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  update public.profiles
  set avatar_url = case
        when p_avatar_url is null then null
        when length(trim(p_avatar_url)) = 0 then null
        else p_avatar_url
      end,
      updated_at = now()
  where id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.update_my_avatar(text) from public;
grant execute on function public.update_my_avatar(text) to authenticated;

-- 3) Publieke profielinfo (respecteert anonymous): avatar alleen als niet anoniem
create or replace function public.get_public_profile_info(p_user_ids uuid[])
returns table (
  id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  anonymous boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id,
    case when coalesce(p.anonymous, false) then null else p.first_name end,
    case when coalesce(p.anonymous, false) then null else p.last_name end,
    case when coalesce(p.anonymous, false) then null else p.avatar_url end,
    coalesce(p.anonymous, false)
  from public.profiles p
  where p.id = any(p_user_ids);
$$;
revoke all on function public.get_public_profile_info(uuid[]) from public;
grant execute on function public.get_public_profile_info(uuid[]) to anon, authenticated;

-- 4) RPC: project-afbeelding bijwerken (alleen eigenaar)
create or replace function public.update_project_image(p_project_id uuid, p_image_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select owner_id into v_owner from public.projects where id = p_project_id;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'project_not_found');
  end if;
  if v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  update public.projects
  set image_url = case
        when p_image_url is null then null
        when length(trim(p_image_url)) = 0 then null
        else p_image_url
      end,
      updated_at = now()
  where id = p_project_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.update_project_image(uuid, text) from public;
grant execute on function public.update_project_image(uuid, text) to authenticated;

-- 5) RPC: community-projecten voor leden (alleen zichtbaar als je lid/sponsor/owner bent)
create or replace function public.list_my_community_projects()
returns table (
  id uuid,
  community_id uuid,
  community_name text,
  community_kind text,
  title text,
  description text,
  target_amount numeric,
  image_url text,
  charity_cause_key text,
  status text,
  visibility text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id,
         p.community_id,
         c.name,
         c.kind,
         coalesce(p.name, '(Onbenoemd project)'),
         p.description,
         coalesce(p.goal, 0)::numeric,
         p.image_url,
         p.charity_cause_key,
         p.status::text,
         coalesce(p.visibility, 'public'),
         p.created_at
  from public.projects p
  join public.communities c on c.id = p.community_id
  where p.community_id is not null
    and lower(coalesce(p.status::text, '')) in ('actief', 'active')
    and (
      public.is_community_member_uid(p.community_id, auth.uid())
      or public.is_community_owner_uid(p.community_id, auth.uid())
    )
  order by p.created_at desc;
$$;
revoke all on function public.list_my_community_projects() from public;
grant execute on function public.list_my_community_projects() to authenticated;
