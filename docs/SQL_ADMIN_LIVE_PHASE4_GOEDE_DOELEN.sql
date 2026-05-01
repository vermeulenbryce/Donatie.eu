-- Fase 4: Goede doelen beheer live maken voor admin + publieke realtime updates
-- Safe/idempotent

begin;

-- 1) Admin policies op site_charity_causes (RLS stond al aan, maar alleen public select bestond)
drop policy if exists site_charity_causes_admin_select on public.site_charity_causes;
create policy site_charity_causes_admin_select
  on public.site_charity_causes
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

drop policy if exists site_charity_causes_admin_insert on public.site_charity_causes;
create policy site_charity_causes_admin_insert
  on public.site_charity_causes
  for insert
  to authenticated
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists site_charity_causes_admin_update on public.site_charity_causes;
create policy site_charity_causes_admin_update
  on public.site_charity_causes
  for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists site_charity_causes_admin_delete on public.site_charity_causes;
create policy site_charity_causes_admin_delete
  on public.site_charity_causes
  for delete
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- 2) Realtime publication
do $$
begin
  alter publication supabase_realtime add table public.site_charity_causes;
exception
  when duplicate_object then null;
end $$;

commit;
