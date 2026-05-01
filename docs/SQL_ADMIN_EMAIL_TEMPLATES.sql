-- E-mail sjablonen voor transactionele mail (Resend via Edge Function send-email)
-- Idempotent. Vereist: public.is_platform_admin() (SQL_ADMIN_LIVE_PHASE1.sql).

create table if not exists public.site_email_templates (
  key         text primary key
              check (char_length(trim(key)) > 0 and char_length(key) <= 80),
  subject     text not null,
  html        text not null,
  updated_at  timestamptz not null default now()
);

comment on table public.site_email_templates is
  'HTML-onderwerpen per template-key; service_role in Edge leest zonder RLS. Alleen platform-admin wijzigt via admin UI.';

drop trigger if exists trg_site_email_templates_updated_at on public.site_email_templates;
create trigger trg_site_email_templates_updated_at
  before update on public.site_email_templates
  for each row execute function public.set_updated_at();

alter table public.site_email_templates enable row level security;

-- Geen policy voor anon: geen publieke SELECT. Alleen platform-admin; Edge gebruikt service_role.
drop policy if exists site_email_templates_admin_all on public.site_email_templates;
create policy site_email_templates_admin_all
  on public.site_email_templates
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

insert into public.site_email_templates (key, subject, html) values
  (
    'welcome',
    'Welkom bij Donatie.eu',
    '<p>Beste {{name}},</p><p>Welkom! Je kunt straks inloggen en doneren via donatie.eu.</p>'
  ),
  (
    'donation_paid',
    'Bevestiging van je donatie',
    '<p>Beste {{name}},</p><p>We hebben je donatie van <strong>€{{amount}}</strong> ontvangen. Bedankt!</p>'
  ),
  (
    'volunteer_approved',
    'Je aanmelding als vrijwilliger is goedgekeurd',
    '<p>Beste {{name}},</p><p>Je staat geregistreerd als vrijwilliger. Dank je wel!</p>'
  )
on conflict (key) do nothing;

do $body$
begin
  if to_regclass('public.site_email_templates') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'site_email_templates'
     )
  then
    alter publication supabase_realtime add table public.site_email_templates;
  end if;
end
$body$;
