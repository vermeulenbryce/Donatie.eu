-- RLS voor public.donations zodat ingelogde donateurs eigen rijen kunnen INSERTen en SELECTen.
-- Voer uit in Supabase SQL Editor als createDonation faalt met "row-level security".

alter table public.donations enable row level security;

drop policy if exists donations_insert_own on public.donations;
create policy donations_insert_own
  on public.donations
  for insert
  to authenticated
  with check (auth.uid() = donor_user_id or auth.uid() = donor_id);

-- Optioneel: alleen eigen rijen lezen (voor /donations en profiel)
drop policy if exists donations_select_own on public.donations;
create policy donations_select_own
  on public.donations
  for select
  to authenticated
  using (
    auth.uid() = donor_user_id
    or auth.uid() = donor_id
  );

-- Anon heeft geen directe toegang; publieke stats via get_public_homepage_stats() (security definer).
