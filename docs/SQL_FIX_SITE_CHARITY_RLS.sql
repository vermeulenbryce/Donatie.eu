-- Fix: RLS blokkeert admin writes op public.site_charity_causes
-- Veilig/idempotent uit te voeren

begin;

alter table public.site_charity_causes enable row level security;

drop policy if exists site_charity_causes_admin_select on public.site_charity_causes;
create policy site_charity_causes_admin_select
  on public.site_charity_causes
  for select
  to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
  );

drop policy if exists site_charity_causes_admin_insert on public.site_charity_causes;
create policy site_charity_causes_admin_insert
  on public.site_charity_causes
  for insert
  to authenticated
  with check (
    public.is_platform_admin(auth.uid())
    or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
  );

drop policy if exists site_charity_causes_admin_update on public.site_charity_causes;
create policy site_charity_causes_admin_update
  on public.site_charity_causes
  for update
  to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
  )
  with check (
    public.is_platform_admin(auth.uid())
    or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
  );

drop policy if exists site_charity_causes_admin_delete on public.site_charity_causes;
create policy site_charity_causes_admin_delete
  on public.site_charity_causes
  for delete
  to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
  );

-- Publieke lees-policy laten bestaan/herstellen
drop policy if exists site_charity_causes_select_all on public.site_charity_causes;
create policy site_charity_causes_select_all
  on public.site_charity_causes
  for select
  to anon, authenticated
  using (active = true);

do $$
begin
  alter publication supabase_realtime add table public.site_charity_causes;
exception
  when duplicate_object then null;
end $$;

commit;
