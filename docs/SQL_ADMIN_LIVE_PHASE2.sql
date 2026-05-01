-- ============================================================
-- Donatie.eu — Admin panel live-sync (Phase 2)
-- Voer uit NA SQL_ADMIN_LIVE_PHASE1.sql. Idempotent / herbruikbaar.
--
-- Wat dit script doet:
--   1. is_platform_admin() accepteert nu ook profiles.is_admin = true
--      (omdat jouw legacy admins in public.admin zitten, niet in auth.users).
--   2. homepage_settings publieke read + admin write policies.
--   3. site_settings bulk-seeds aanvullen (navbar, branding, etc.).
--   4. Storage bucket site-branding (publiek) + policy-helpers.
--   5. Realtime publicaties voor bestaande tabellen die nog niet toegevoegd waren.
-- ============================================================

-- ── 1. is_platform_admin: dubbele bron (raw_app_meta_data.role='admin' OF profiles.is_admin=true)
create or replace function public.is_platform_admin(p_uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from auth.users au
    left join public.profiles p on p.id = au.id
    where au.id = p_uid
      and (
        coalesce(au.raw_app_meta_data->>'role', '') = 'admin'
        or coalesce(p.is_admin, false) = true
      )
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to anon, authenticated;

-- ── 2. homepage_settings: RLS — iedereen mag lezen, alleen admin schrijft
alter table public.homepage_settings enable row level security;

drop policy if exists homepage_settings_select_all on public.homepage_settings;
create policy homepage_settings_select_all
  on public.homepage_settings for select
  to anon, authenticated
  using (true);

drop policy if exists homepage_settings_write_admin on public.homepage_settings;
create policy homepage_settings_write_admin
  on public.homepage_settings for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Zorg dat er altijd precies één row (id=1) bestaat
insert into public.homepage_settings (id) values (1)
on conflict (id) do nothing;

-- ── 3. site_settings: aanvullende seeds (veilig her-te-draaien)
insert into public.site_settings (key, value) values
  ('branding_colors',   jsonb_build_object('primary','#1a237e','accent','#3a98f8')),
  ('feature_flags',     '{}'::jsonb),
  ('responsive_config', jsonb_build_object('breakpoints', jsonb_build_array(375, 768, 1024, 1440)))
on conflict (key) do nothing;

-- ── 4. Storage bucket voor branding-uploads (logo's, banners)
insert into storage.buckets (id, name, public)
values ('site-branding', 'site-branding', true)
on conflict (id) do nothing;

-- Policies op storage.objects voor deze bucket
drop policy if exists site_branding_public_read on storage.objects;
create policy site_branding_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'site-branding');

drop policy if exists site_branding_admin_write on storage.objects;
create policy site_branding_admin_write
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-branding' and public.is_platform_admin(auth.uid()));

drop policy if exists site_branding_admin_update on storage.objects;
create policy site_branding_admin_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-branding' and public.is_platform_admin(auth.uid()))
  with check (bucket_id = 'site-branding' and public.is_platform_admin(auth.uid()));

drop policy if exists site_branding_admin_delete on storage.objects;
create policy site_branding_admin_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-branding' and public.is_platform_admin(auth.uid()));

-- ── 5. Realtime publicatie uitbreiden (safe, elke tabel eigen DO-block)
do $$ begin alter publication supabase_realtime add table public.homepage_settings;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.site_shop_items;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.site_shop_redemptions;
  exception when duplicate_object then null; when undefined_table then null; end $$;

-- ── 6. Hulp-RPC: laat admin een gebruikersprofiel opzoeken voor push / meekijken
create or replace function public.admin_search_users(p_query text, p_limit integer default 20)
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
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.admin_search_users(text, integer) from public;
grant execute on function public.admin_search_users(text, integer) to authenticated;

-- ============================================================
-- Klaar. Om je huidige account admin te maken zonder auth-user te hermaken:
--   update public.profiles set is_admin = true where email = 'admin@donatie.eu';
-- (of vervang email door je login-e-mail)
-- ============================================================
