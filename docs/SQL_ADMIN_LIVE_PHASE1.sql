-- ============================================================
-- Donatie.eu — Admin panel live-sync (Phase 1)
-- Voer in één keer uit in Supabase SQL Editor.
-- Alles is idempotent: herhaald uitvoeren is veilig.
-- ------------------------------------------------------------
-- Vereist bestaande tabellen uit eerdere docs:
--   profiles, donations, communities, community_members,
--   community_posts, site_charity_causes, site_shop_items
-- ============================================================

-- ── 0. Helpers ─────────────────────────────────────────────
-- Generieke updated_at trigger (veilig te herdefiniëren)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- is_platform_admin staat al in SQL_SITE_SHOP_AND_POINTS.sql; hier defensief opnieuw.
create or replace function public.is_platform_admin(p_uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from auth.users au
    where au.id = p_uid
      and coalesce(au.raw_app_meta_data->>'role', '') = 'admin'
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to anon, authenticated;

-- ── 1. site_settings: key/value (jsonb) voor navbar, branding,
--    homepage, punten_config, donation_amounts, markten_modules,
--    footer_content, legal_pages, etc.
-- ────────────────────────────────────────────────────────────
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

drop policy if exists site_settings_select_all on public.site_settings;
create policy site_settings_select_all
  on public.site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists site_settings_write_admin on public.site_settings;
create policy site_settings_write_admin
  on public.site_settings for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Basis-seeds (overschrijven niet als al gezet)
insert into public.site_settings (key, value) values
  ('navbar_items',      '[]'::jsonb),
  ('branding',          '{}'::jsonb),
  ('homepage',          '{}'::jsonb),
  ('points_config',     '{}'::jsonb),
  ('donation_amounts',  '{}'::jsonb),
  ('markten_modules',   '{}'::jsonb),
  ('footer_content',    '{}'::jsonb),
  ('legal_pages',       '{}'::jsonb)
on conflict (key) do nothing;

-- ── 2. site_featured_causes: welke CBF-IDs zijn uitgelicht op homepage
-- ────────────────────────────────────────────────────────────
create table if not exists public.site_featured_causes (
  id          uuid primary key default gen_random_uuid(),
  cause_key   text not null,                       -- bv. 'cbf-1'
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cause_key)
);

drop trigger if exists trg_site_featured_causes_updated_at on public.site_featured_causes;
create trigger trg_site_featured_causes_updated_at
  before update on public.site_featured_causes
  for each row execute function public.set_updated_at();

alter table public.site_featured_causes enable row level security;

drop policy if exists site_featured_causes_select_all on public.site_featured_causes;
create policy site_featured_causes_select_all
  on public.site_featured_causes for select
  to anon, authenticated
  using (active or public.is_platform_admin(auth.uid()));

drop policy if exists site_featured_causes_write_admin on public.site_featured_causes;
create policy site_featured_causes_write_admin
  on public.site_featured_causes for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ── 3. site_news_posts: nieuwsberichten
-- ────────────────────────────────────────────────────────────
create table if not exists public.site_news_posts (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text unique,
  excerpt       text,
  body          text,
  image_url     text,
  category      text not null default 'nieuws'
                check (category = any (array['nieuws','update','evenement','actie','succes']::text[])),
  published     boolean not null default false,
  published_at  timestamptz,
  author_id     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_site_news_posts_published
  on public.site_news_posts (published, published_at desc);

create index if not exists idx_site_news_posts_category_published
  on public.site_news_posts (category, published, published_at desc);

drop trigger if exists trg_site_news_posts_updated_at on public.site_news_posts;
create trigger trg_site_news_posts_updated_at
  before update on public.site_news_posts
  for each row execute function public.set_updated_at();

alter table public.site_news_posts enable row level security;

drop policy if exists site_news_posts_select_public on public.site_news_posts;
create policy site_news_posts_select_public
  on public.site_news_posts for select
  to anon, authenticated
  using (published = true or public.is_platform_admin(auth.uid()));

drop policy if exists site_news_posts_write_admin on public.site_news_posts;
create policy site_news_posts_write_admin
  on public.site_news_posts for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ── 4. site_faq_items: FAQ beheren
-- ────────────────────────────────────────────────────────────
create table if not exists public.site_faq_items (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'algemeen',
  question    text not null,
  answer      text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_site_faq_items_active_order
  on public.site_faq_items (active, sort_order);

drop trigger if exists trg_site_faq_items_updated_at on public.site_faq_items;
create trigger trg_site_faq_items_updated_at
  before update on public.site_faq_items
  for each row execute function public.set_updated_at();

alter table public.site_faq_items enable row level security;

drop policy if exists site_faq_items_select_public on public.site_faq_items;
create policy site_faq_items_select_public
  on public.site_faq_items for select
  to anon, authenticated
  using (active or public.is_platform_admin(auth.uid()));

drop policy if exists site_faq_items_write_admin on public.site_faq_items;
create policy site_faq_items_write_admin
  on public.site_faq_items for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ── 5. volunteer_requests + profiles.is_volunteer
-- ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_volunteer boolean not null default false;

create table if not exists public.volunteer_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  motivation    text,
  availability  text,
  phone         text,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  reviewer_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_volunteer_requests_pending_per_user
  on public.volunteer_requests (user_id)
  where status = 'pending';

drop trigger if exists trg_volunteer_requests_updated_at on public.volunteer_requests;
create trigger trg_volunteer_requests_updated_at
  before update on public.volunteer_requests
  for each row execute function public.set_updated_at();

alter table public.volunteer_requests enable row level security;

drop policy if exists volunteer_requests_select_own_or_admin on public.volunteer_requests;
create policy volunteer_requests_select_own_or_admin
  on public.volunteer_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists volunteer_requests_insert_own on public.volunteer_requests;
create policy volunteer_requests_insert_own
  on public.volunteer_requests for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists volunteer_requests_update_admin on public.volunteer_requests;
create policy volunteer_requests_update_admin
  on public.volunteer_requests for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Als admin een verzoek approved: flag op profile zetten
create or replace function public.handle_volunteer_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and coalesce(old.status, '') <> 'approved' then
    update public.profiles set is_volunteer = true, updated_at = now() where id = new.user_id;
  elsif new.status = 'rejected' and coalesce(old.status, '') = 'approved' then
    update public.profiles set is_volunteer = false, updated_at = now() where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_volunteer_requests_approve_sync on public.volunteer_requests;
create trigger trg_volunteer_requests_approve_sync
  after update on public.volunteer_requests
  for each row execute function public.handle_volunteer_request_update();

-- ── 6. admin_shadow_grants: gebruiker staat admin toe mee te kijken
-- ────────────────────────────────────────────────────────────
create table if not exists public.admin_shadow_grants (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  granted     boolean not null default false,
  granted_at  timestamptz,
  revoked_at  timestamptz,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_admin_shadow_grants_updated_at on public.admin_shadow_grants;
create trigger trg_admin_shadow_grants_updated_at
  before update on public.admin_shadow_grants
  for each row execute function public.set_updated_at();

alter table public.admin_shadow_grants enable row level security;

drop policy if exists admin_shadow_grants_select on public.admin_shadow_grants;
create policy admin_shadow_grants_select
  on public.admin_shadow_grants for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists admin_shadow_grants_upsert_own on public.admin_shadow_grants;
create policy admin_shadow_grants_upsert_own
  on public.admin_shadow_grants for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists admin_shadow_grants_update_own on public.admin_shadow_grants;
create policy admin_shadow_grants_update_own
  on public.admin_shadow_grants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 7. site_notifications: meldingen + push-berichten
--    type: 'melding' = gebruiker→admin, 'push' = admin→gebruiker, 'actie' = admin-wijde actie
-- ────────────────────────────────────────────────────────────
create table if not exists public.site_notifications (
  id             uuid primary key default gen_random_uuid(),
  type           text not null check (type in ('melding','push','actie')),
  from_user_id   uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete cascade,   -- null = all users (push broadcast)
  title          text not null,
  body           text,
  icon           text,
  data           jsonb not null default '{}'::jsonb,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_site_notifications_target
  on public.site_notifications (target_user_id, created_at desc);
create index if not exists idx_site_notifications_type
  on public.site_notifications (type, created_at desc);

alter table public.site_notifications enable row level security;

-- melding (gebruiker stuurt naar admin): iedereen authenticated mag er één insertten voor zichzelf (from_user_id = auth.uid()); admin ziet alles.
-- push (admin→user): admin inserteert; betrokken user (of iedereen bij target_user_id null) leest.
drop policy if exists site_notifications_select on public.site_notifications;
create policy site_notifications_select
  on public.site_notifications for select
  to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or target_user_id = auth.uid()
    or (type = 'push' and target_user_id is null)           -- broadcast push
    or (type = 'melding' and from_user_id = auth.uid())     -- eigen meldingen
  );

drop policy if exists site_notifications_insert_melding on public.site_notifications;
create policy site_notifications_insert_melding
  on public.site_notifications for insert
  to authenticated
  with check (
    (type = 'melding' and from_user_id = auth.uid())
    or public.is_platform_admin(auth.uid())
  );

drop policy if exists site_notifications_update_self_read on public.site_notifications;
create policy site_notifications_update_self_read
  on public.site_notifications for update
  to authenticated
  using (target_user_id = auth.uid() or public.is_platform_admin(auth.uid()))
  with check (target_user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists site_notifications_delete_admin on public.site_notifications;
create policy site_notifications_delete_admin
  on public.site_notifications for delete
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- ── 8. active_sessions: heartbeat zodat admin ziet wie nu online is
-- ────────────────────────────────────────────────────────────
create table if not exists public.active_sessions (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  last_heartbeat  timestamptz not null default now(),
  user_agent      text,
  ip_hint         text,
  route           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_active_sessions_heartbeat
  on public.active_sessions (last_heartbeat desc);

alter table public.active_sessions enable row level security;

drop policy if exists active_sessions_select_admin on public.active_sessions;
create policy active_sessions_select_admin
  on public.active_sessions for select
  to authenticated
  using (public.is_platform_admin(auth.uid()) or user_id = auth.uid());

drop policy if exists active_sessions_upsert_own on public.active_sessions;
create policy active_sessions_upsert_own
  on public.active_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists active_sessions_update_own on public.active_sessions;
create policy active_sessions_update_own
  on public.active_sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists active_sessions_delete_own_or_admin on public.active_sessions;
create policy active_sessions_delete_own_or_admin
  on public.active_sessions for delete
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

-- RPC om heartbeat compact te updaten
create or replace function public.heartbeat_session(p_route text default null, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.active_sessions (user_id, last_heartbeat, route, user_agent)
    values (auth.uid(), now(), p_route, p_user_agent)
  on conflict (user_id) do update
    set last_heartbeat = excluded.last_heartbeat,
        route          = coalesce(excluded.route, public.active_sessions.route),
        user_agent     = coalesce(excluded.user_agent, public.active_sessions.user_agent);
end;
$$;

revoke all on function public.heartbeat_session(text, text) from public;
grant execute on function public.heartbeat_session(text, text) to authenticated;

-- ── 9. Admin overzicht-RPC's (geaggregeerd, SECURITY DEFINER)
-- ────────────────────────────────────────────────────────────
create or replace function public.admin_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_users_total     bigint;
  v_users_individu  bigint;
  v_users_bedrijf   bigint;
  v_users_infl      bigint;
  v_communities     bigint;
  v_total_paid      numeric;
  v_total_points    bigint;
  v_active_now      bigint;
  v_volunteer_open  bigint;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  select count(*) into v_users_total from public.profiles;
  select count(*) filter (where lower(coalesce(account_type,'individu')) = 'individu') into v_users_individu from public.profiles;
  select count(*) filter (where lower(coalesce(account_type,'')) = 'bedrijf')   into v_users_bedrijf   from public.profiles;
  select count(*) filter (where lower(coalesce(account_type,'')) = 'influencer') into v_users_infl     from public.profiles;

  select count(*) into v_communities from public.communities;
  select coalesce(sum(amount::numeric), 0) into v_total_paid
    from public.donations where lower(coalesce(status::text,'')) = 'paid' and refunded_at is null;
  select coalesce(sum(points), 0) into v_total_points from public.profiles;

  select count(*) into v_active_now from public.active_sessions where last_heartbeat > now() - interval '5 minutes';
  select count(*) into v_volunteer_open from public.volunteer_requests where status = 'pending';

  return json_build_object(
    'users_total', v_users_total,
    'users_individu', v_users_individu,
    'users_bedrijf', v_users_bedrijf,
    'users_influencer', v_users_infl,
    'communities_total', v_communities,
    'total_donated_paid', v_total_paid,
    'total_points_distributed', v_total_points,
    'active_sessions_5min', v_active_now,
    'volunteer_requests_open', v_volunteer_open,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- Financieel overzicht (admin)
create or replace function public.admin_finance_overview(p_days integer default 30)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_json json;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  select json_build_object(
    'period_days', p_days,
    'paid_total', coalesce(sum(amount::numeric) filter (where lower(coalesce(status::text,''))='paid' and refunded_at is null), 0),
    'paid_count', count(*) filter (where lower(coalesce(status::text,''))='paid' and refunded_at is null),
    'refunded_total', coalesce(sum(amount::numeric) filter (where lower(coalesce(status::text,''))='refunded'), 0),
    'refunded_count', count(*) filter (where lower(coalesce(status::text,''))='refunded'),
    'pending_count', count(*) filter (where lower(coalesce(status::text,''))='pending'),
    'cancelled_count', count(*) filter (where lower(coalesce(status::text,''))='cancelled')
  ) into v_json
  from public.donations
  where created_at > now() - make_interval(days => greatest(p_days, 1));

  return v_json;
end;
$$;

revoke all on function public.admin_finance_overview(integer) from public;
grant execute on function public.admin_finance_overview(integer) to authenticated;

-- Actieve sessies + profielinfo (admin ziet wie online is)
create or replace function public.admin_list_active_sessions(p_since_minutes integer default 5)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  account_type text,
  last_heartbeat timestamptz,
  route text,
  shadow_granted boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    s.user_id,
    au.email::text,
    p.first_name,
    p.last_name,
    p.account_type,
    s.last_heartbeat,
    s.route,
    coalesce(g.granted, false) as shadow_granted
  from public.active_sessions s
  left join auth.users au    on au.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join public.admin_shadow_grants g on g.user_id = s.user_id
  where s.last_heartbeat > now() - make_interval(mins => greatest(p_since_minutes, 1))
  order by s.last_heartbeat desc;
end;
$$;

revoke all on function public.admin_list_active_sessions(integer) from public;
grant execute on function public.admin_list_active_sessions(integer) to authenticated;

-- ── 10. Realtime publication (Supabase standaard is `supabase_realtime`)
-- BELANGRIJK: elke tabel in eigen DO-block, anders breekt duplicate op tabel A
-- de toevoeging van tabel B (Postgres rollbackt het hele statement).
-- ────────────────────────────────────────────────────────────
do $$ begin alter publication supabase_realtime add table public.site_settings;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.site_featured_causes;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.site_news_posts;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.site_faq_items;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.volunteer_requests;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.admin_shadow_grants;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.site_notifications;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.active_sessions;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.donations;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null; when undefined_table then null; end $$;
do $$ begin alter publication supabase_realtime add table public.communities;
  exception when duplicate_object then null; when undefined_table then null; end $$;

-- ============================================================
-- Klaar. Zet daarna één admin-account in Supabase Auth op role = 'admin':
--
--   update auth.users
--     set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('role','admin')
--     where email = 'admin@donatie.eu';
--
-- Zonder die flag heeft is_platform_admin() false en krijgt de React admin geen
-- schrijfrechten op bovenstaande tabellen (RLS werkt dan zoals bedoeld).
-- ============================================================
