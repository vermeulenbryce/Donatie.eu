-- (Legacy / optioneel) Ooit bedoeld voor bewerkbare navigatie via site_settings.
-- Productbesluit: **geen** admin voor navbar; vaste `BASE_NAV` in PublicLayout. Zie ADMIN_LIVE_PLAN.md
--
-- Fase 5: Navigatiebalk live via site_settings.navbar_items
-- Idempotent, veilig meerdere keren uit te voeren.

begin;

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
  using (
    public.is_platform_admin(auth.uid())
    or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
  )
  with check (
    public.is_platform_admin(auth.uid())
    or (auth.jwt() ->> 'email') = 'admin@donatie.eu'
  );

insert into public.site_settings (key, value)
values ('navbar_items', '[]'::jsonb)
on conflict (key) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.site_settings;
exception
  when duplicate_object then null;
end $$;

commit;
