-- ============================================================
-- Community posts — CRUD via security-definer RPCs
-- (tabel public.community_posts bestaat al met RLS select/insert voor leden+owner)
-- ============================================================

-- 1) Post toevoegen (voor member/sponsor/owner; auteur wordt auto auth.uid())
create or replace function public.create_community_post(
  p_community_id uuid,
  p_body text,
  p_project_id uuid default null
)
returns public.community_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_row public.community_posts;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if length(v_body) = 0 then
    raise exception 'body_required';
  end if;
  if length(v_body) > 8000 then
    raise exception 'body_too_long';
  end if;

  if not public.can_access_community_uid(p_community_id, v_uid) then
    raise exception 'not_a_member';
  end if;

  insert into public.community_posts (community_id, project_id, author_id, body)
  values (p_community_id, p_project_id, v_uid, v_body)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_community_post(uuid, text, uuid) from public;
grant execute on function public.create_community_post(uuid, text, uuid) to authenticated;

-- 2) Post verwijderen (auteur zelf OF community-eigenaar)
create or replace function public.delete_community_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_post from public.community_posts where id = p_post_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'post_not_found');
  end if;

  if v_post.author_id <> v_uid
     and not public.is_community_owner_uid(v_post.community_id, v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  delete from public.community_posts where id = p_post_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_community_post(uuid) from public;
grant execute on function public.delete_community_post(uuid) to authenticated;

-- 3) Posts ophalen met auteur-info (naam, avatar-letter hint)
create or replace function public.list_community_posts(
  p_community_id uuid,
  p_limit int default 50
)
returns table (
  id uuid,
  community_id uuid,
  project_id uuid,
  author_id uuid,
  author_first_name text,
  author_last_name text,
  author_email text,
  is_owner boolean,
  body text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.community_id,
    p.project_id,
    p.author_id,
    pr.first_name,
    pr.last_name,
    pr.email,
    (p.author_id = co.owner_user_id) as is_owner,
    p.body,
    p.created_at
  from public.community_posts p
  join public.communities co on co.id = p.community_id
  left join public.profiles pr on pr.id = p.author_id
  where p.community_id = p_community_id
    and public.can_access_community_uid(p.community_id, auth.uid())
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_community_posts(uuid, int) from public;
grant execute on function public.list_community_posts(uuid, int) to authenticated;
