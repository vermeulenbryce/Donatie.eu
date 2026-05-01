-- ============================================================
-- Community extensions: sponsor-rol, ledenbeheer, puntenwinkel
-- Uitvoeren na de bestaande community-migraties.
-- ============================================================

-- 1) role 'sponsor' toestaan in community_members
alter table public.community_members drop constraint if exists community_members_role_check;
alter table public.community_members
  add constraint community_members_role_check
  check (role in ('owner', 'member', 'sponsor'));

-- 2) RPC: leden van een community ophalen (alleen voor de eigenaar)
create or replace function public.list_community_members_for_owner(p_community_id uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role text,
  joined_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select m.user_id, p.email, p.first_name, p.last_name, m.role::text, m.joined_at
  from public.community_members m
  join public.communities co on co.id = m.community_id
  left join public.profiles p on p.id = m.user_id
  where m.community_id = p_community_id
    and co.owner_user_id = auth.uid()
  order by m.joined_at desc;
$$;

revoke all on function public.list_community_members_for_owner(uuid) from public;
grant execute on function public.list_community_members_for_owner(uuid) to authenticated;

-- 3) RPC: lid verwijderen (alleen de eigenaar, niet zichzelf)
create or replace function public.remove_community_member(p_community_id uuid, p_user_id uuid)
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

  select owner_user_id into v_owner from public.communities where id = p_community_id;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'community_not_found');
  end if;

  if v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  if p_user_id = v_owner then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;

  delete from public.community_members
  where community_id = p_community_id
    and user_id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.remove_community_member(uuid, uuid) from public;
grant execute on function public.remove_community_member(uuid, uuid) to authenticated;

-- 4) RPC: aansluiten als sponsor (voor bedrijfsaccounts die een andere community willen steunen)
create or replace function public.join_community_as_sponsor(raw_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comm record;
  v_code text := upper(trim(raw_code));
  v_mem_role text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select co.*
  into v_comm
  from public.communities co
  where upper(co.join_code) = v_code
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if v_comm.owner_user_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'cannot_sponsor_own_community');
  end if;

  select m.role::text into v_mem_role
  from public.community_members m
  where m.community_id = v_comm.id and m.user_id = v_uid
  limit 1;

  if found then
    if v_mem_role = 'owner' then
      return jsonb_build_object('ok', false, 'error', 'already_owner');
    end if;
    -- Upgrade member -> sponsor (of blijf sponsor)
    update public.community_members
    set role = 'sponsor'
    where community_id = v_comm.id and user_id = v_uid;
    return jsonb_build_object('ok', true, 'community_id', v_comm.id, 'upgraded', v_mem_role <> 'sponsor');
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (v_comm.id, v_uid, 'sponsor');

  return jsonb_build_object('ok', true, 'community_id', v_comm.id, 'role', 'sponsor');
end;
$$;

revoke all on function public.join_community_as_sponsor(text) from public;
grant execute on function public.join_community_as_sponsor(text) to authenticated;

-- 5) Puntenwinkel per community
create table if not exists public.community_shop_items (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null,
  description text,
  cost integer not null check (cost >= 0),
  stock integer not null default 0,
  emoji text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_shop_items_community
  on public.community_shop_items (community_id);

drop trigger if exists trg_community_shop_items_updated_at on public.community_shop_items;
create trigger trg_community_shop_items_updated_at
  before update on public.community_shop_items
  for each row
  execute function public.set_updated_at();

alter table public.community_shop_items enable row level security;

-- Leden + eigenaar zien actieve items; eigenaar ziet alles.
drop policy if exists community_shop_items_select on public.community_shop_items;
create policy community_shop_items_select
  on public.community_shop_items
  for select
  to authenticated
  using (
    public.is_community_owner_uid(community_id, auth.uid())
    or (
      active
      and public.is_community_member_uid(community_id, auth.uid())
    )
  );

-- Eigenaar mag insert/update/delete
drop policy if exists community_shop_items_insert_owner on public.community_shop_items;
create policy community_shop_items_insert_owner
  on public.community_shop_items
  for insert
  to authenticated
  with check (public.is_community_owner_uid(community_id, auth.uid()));

drop policy if exists community_shop_items_update_owner on public.community_shop_items;
create policy community_shop_items_update_owner
  on public.community_shop_items
  for update
  to authenticated
  using (public.is_community_owner_uid(community_id, auth.uid()))
  with check (public.is_community_owner_uid(community_id, auth.uid()));

drop policy if exists community_shop_items_delete_owner on public.community_shop_items;
create policy community_shop_items_delete_owner
  on public.community_shop_items
  for delete
  to authenticated
  using (public.is_community_owner_uid(community_id, auth.uid()));

-- Realtime (optioneel)
do $$
begin
  if to_regclass('public.community_shop_items') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'community_shop_items'
     )
  then
    alter publication supabase_realtime add table public.community_shop_items;
  end if;
end $$;
