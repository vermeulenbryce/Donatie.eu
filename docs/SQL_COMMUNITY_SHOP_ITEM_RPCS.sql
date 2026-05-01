-- ============================================================
-- Community shop CRUD via security-definer RPC's (omzeilt RLS-edge-cases)
-- ============================================================

create or replace function public.create_community_shop_item(
  p_community_id uuid,
  p_title text,
  p_description text default null,
  p_cost int default 0,
  p_stock int default 0,
  p_emoji text default null,
  p_active boolean default true
)
returns public.community_shop_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.community_shop_items;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_community_owner_uid(p_community_id, v_uid) then
    raise exception 'not_owner_of_community';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title_required';
  end if;

  insert into public.community_shop_items (community_id, title, description, cost, stock, emoji, active)
  values (
    p_community_id,
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    greatest(0, coalesce(p_cost, 0)),
    greatest(0, coalesce(p_stock, 0)),
    nullif(trim(coalesce(p_emoji, '')), ''),
    coalesce(p_active, true)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_community_shop_item(uuid, text, text, int, int, text, boolean) from public;
grant execute on function public.create_community_shop_item(uuid, text, text, int, int, text, boolean) to authenticated;

create or replace function public.update_community_shop_item(
  p_item_id uuid,
  p_title text default null,
  p_description text default null,
  p_cost int default null,
  p_stock int default null,
  p_emoji text default null,
  p_active boolean default null
)
returns public.community_shop_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.community_shop_items;
  v_comm uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select community_id into v_comm from public.community_shop_items where id = p_item_id;
  if v_comm is null then
    raise exception 'item_not_found';
  end if;
  if not public.is_community_owner_uid(v_comm, v_uid) then
    raise exception 'not_owner_of_community';
  end if;

  update public.community_shop_items
  set
    title = coalesce(nullif(trim(p_title), ''), title),
    description = case
      when p_description is null then description
      when trim(p_description) = '' then null
      else trim(p_description)
    end,
    cost = coalesce(greatest(0, p_cost), cost),
    stock = coalesce(greatest(0, p_stock), stock),
    emoji = case
      when p_emoji is null then emoji
      when trim(p_emoji) = '' then null
      else trim(p_emoji)
    end,
    active = coalesce(p_active, active),
    updated_at = now()
  where id = p_item_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_community_shop_item(uuid, text, text, int, int, text, boolean) from public;
grant execute on function public.update_community_shop_item(uuid, text, text, int, int, text, boolean) to authenticated;

create or replace function public.delete_community_shop_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comm uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select community_id into v_comm from public.community_shop_items where id = p_item_id;
  if v_comm is null then
    return jsonb_build_object('ok', false, 'error', 'item_not_found');
  end if;
  if not public.is_community_owner_uid(v_comm, v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_owner_of_community');
  end if;
  delete from public.community_shop_items where id = p_item_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_community_shop_item(uuid) from public;
grant execute on function public.delete_community_shop_item(uuid) to authenticated;
