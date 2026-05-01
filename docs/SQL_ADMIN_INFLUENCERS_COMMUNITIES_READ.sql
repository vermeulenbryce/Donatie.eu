-- Admin portal: "Influencers & Communities" — RLS lezen voor platform admin
-- Vereist: public.is_platform_admin() (bijv. SQL_ADMIN_LIVE_PHASE1.sql) en tabellen
--   public.communities, public.community_members met bestaande RLS.
-- Idempotent.

drop policy if exists communities_select_admin on public.communities;
create policy communities_select_admin
  on public.communities
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

drop policy if exists community_members_select_admin on public.community_members;
create policy community_members_select_admin
  on public.community_members
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- Realtime: member count in admin-lijst mee verversen
do $body$
begin
  if to_regclass('public.community_members') is not null
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime'
         and n.nspname = 'public'
         and c.relname = 'community_members'
     )
  then
    alter publication supabase_realtime add table public.community_members;
  end if;
end
$body$;
