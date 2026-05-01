-- Fix/Setup: site-branding storage bucket + policies for admin uploads
-- Idempotent

begin;

insert into storage.buckets (id, name, public)
values ('site-branding', 'site-branding', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists site_branding_public_read on storage.objects;
create policy site_branding_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'site-branding');

drop policy if exists site_branding_admin_insert on storage.objects;
create policy site_branding_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'site-branding'
    and (
      public.is_platform_admin(auth.uid())
      or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
    )
  );

drop policy if exists site_branding_admin_update on storage.objects;
create policy site_branding_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'site-branding'
    and (
      public.is_platform_admin(auth.uid())
      or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
    )
  )
  with check (
    bucket_id = 'site-branding'
    and (
      public.is_platform_admin(auth.uid())
      or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
    )
  );

drop policy if exists site_branding_admin_delete on storage.objects;
create policy site_branding_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'site-branding'
    and (
      public.is_platform_admin(auth.uid())
      or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
    )
  );

commit;
