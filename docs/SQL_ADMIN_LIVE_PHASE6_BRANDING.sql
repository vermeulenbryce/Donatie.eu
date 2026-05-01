-- Fase 6: Logo's & Branding live via site_settings.branding
-- Idempotent

begin;

insert into public.site_settings (key, value)
values (
  'branding',
  jsonb_build_object(
    'logoNavUrl', null,
    'logoFooterUrl', null,
    'logoAdminUrl', null,
    'faviconUrl', null
  )
)
on conflict (key) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.site_settings;
exception
  when duplicate_object then null;
end $$;

commit;
