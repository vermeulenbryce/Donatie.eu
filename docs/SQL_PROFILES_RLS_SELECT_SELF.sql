-- Zorgt dat ingelogde gebruikers hun eigen profielrij mogen lezen.
-- Nodig voor o.a. Supabase Realtime (postgres_changes) op public.profiles.
-- Alleen uitvoeren als je nog geen vergelijkbare policy hebt (anders errors negeren of aanpassen).

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Tip: laat INSERT/UPDATE van profielen lopen via bestaande policies of RPC’s; dit script voegt alleen SELECT toe.
