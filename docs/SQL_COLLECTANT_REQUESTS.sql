-- Collectant-aanmeldingen (zelfde model als vrijwilliger_requests)
-- Voer uit ná SQL_ADMIN_LIVE_PHASE1.sql (is_platform_admin, set_updated_at, supabase_realtime).
-- Idempotent waar mogelijk.

-- ── profiles.is_collectant
alter table public.profiles
  add column if not exists is_collectant boolean not null default false;

-- ── collectant_requests
create table if not exists public.collectant_requests (
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

create unique index if not exists uq_collectant_requests_pending_per_user
  on public.collectant_requests (user_id)
  where status = 'pending';

drop trigger if exists trg_collectant_requests_updated_at on public.collectant_requests;
create trigger trg_collectant_requests_updated_at
  before update on public.collectant_requests
  for each row execute function public.set_updated_at();

alter table public.collectant_requests enable row level security;

drop policy if exists collectant_requests_select_own_or_admin on public.collectant_requests;
create policy collectant_requests_select_own_or_admin
  on public.collectant_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin(auth.uid()));

drop policy if exists collectant_requests_insert_own on public.collectant_requests;
create policy collectant_requests_insert_own
  on public.collectant_requests for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists collectant_requests_update_admin on public.collectant_requests;
create policy collectant_requests_update_admin
  on public.collectant_requests for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

create or replace function public.handle_collectant_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and coalesce(old.status, '') <> 'approved' then
    update public.profiles set is_collectant = true, updated_at = now() where id = new.user_id;
  elsif new.status = 'rejected' and coalesce(old.status, '') = 'approved' then
    update public.profiles set is_collectant = false, updated_at = now() where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_collectant_requests_approve_sync on public.collectant_requests;
create trigger trg_collectant_requests_approve_sync
  after update on public.collectant_requests
  for each row execute function public.handle_collectant_request_update();

-- Realtime
do $body$
begin
  if to_regclass('public.collectant_requests') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'collectant_requests'
     )
  then
    alter publication supabase_realtime add table public.collectant_requests;
  end if;
end
$body$;

-- ── Admin dashboard: open collectant-verzoeken tellen
create or replace function public.admin_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_users_total bigint;
  v_users_individu bigint;
  v_users_bedrijf bigint;
  v_users_infl bigint;
  v_communities bigint;
  v_total_paid numeric;
  v_total_points bigint;
  v_active_now bigint;
  v_volunteer_open bigint;
  v_collectant_open bigint;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  select count(*) into v_users_total from public.profiles;
  select count(*) filter (where lower(coalesce(account_type,'individu')) = 'individu') into v_users_individu from public.profiles;
  select count(*) filter (where lower(coalesce(account_type,'')) = 'bedrijf') into v_users_bedrijf from public.profiles;
  select count(*) filter (where lower(coalesce(account_type,'')) = 'influencer') into v_users_infl from public.profiles;

  select count(*) into v_communities from public.communities;
  select coalesce(sum(amount::numeric), 0) into v_total_paid
    from public.donations where lower(coalesce(status::text,'')) = 'paid' and refunded_at is null;
  select coalesce(sum(points), 0) into v_total_points from public.profiles;

  select count(*) into v_active_now from public.active_sessions where last_heartbeat > now() - interval '5 minutes';
  select count(*) into v_volunteer_open from public.volunteer_requests where status = 'pending';

  if to_regclass('public.collectant_requests') is not null then
    select count(*) into v_collectant_open from public.collectant_requests where status = 'pending';
  else
    v_collectant_open := 0;
  end if;

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
    'collectant_requests_open', coalesce(v_collectant_open, 0),
    'generated_at', now()
  );
end;
$$;

-- E-mailtemplate (Edge send-email)

insert into public.site_email_templates (key, subject, html) values
  (
    'collectant_approved',
    'Je aanmelding als collectant is goedgekeurd',
    '<p>Beste {{name}},</p><p>Je staat geregistreerd als collectant. Dank je wel!</p>'
  )
on conflict (key) do nothing;
