-- Owner mag community-projecten aanmaken en status wijzigen (na communities-SQL).
-- Voer uit als inserts/updates op public.projects falen door RLS.

alter table public.projects enable row level security;

drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner
  on public.projects
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner
  on public.projects
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Optioneel: eigen projecten lezen (naast bestaande public community policy)
drop policy if exists projects_select_owner on public.projects;
create policy projects_select_owner
  on public.projects
  for select
  to authenticated
  using (owner_id = auth.uid());
