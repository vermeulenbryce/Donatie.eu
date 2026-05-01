-- Admin portal: "Community beheer" — RLS: platform admin leest posts, winkel, projecten
-- Vereist: public.is_platform_admin() (bijv. SQL_ADMIN_LIVE_PHASE1.sql) en
--   bestaande tabellen public.community_posts, public.community_shop_items, public.projects.
-- Idempotent.

drop policy if exists community_posts_select_admin on public.community_posts;
create policy community_posts_select_admin
  on public.community_posts
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

drop policy if exists community_shop_items_select_admin on public.community_shop_items;
create policy community_shop_items_select_admin
  on public.community_shop_items
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

drop policy if exists projects_select_admin on public.projects;
create policy projects_select_admin
  on public.projects
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));
