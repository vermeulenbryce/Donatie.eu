-- ============================================================
-- Donatie.eu — Admin hard-lock op admin@donatie.eu
-- Vereist: je hebt via Dashboard → Authentication → Users een user
--          admin@donatie.eu aangemaakt (Auto Confirm aan).
-- Idempotent. Draai na SQL_ADMIN_LIVE_PHASE2.sql.
-- ============================================================

-- 1) Zorg dat er een profiles-rij is voor admin@donatie.eu en zet is_admin = true.
insert into public.profiles (id, email, is_admin, account_type)
select au.id, au.email::text, true, 'individu'
from auth.users au
where lower(au.email) = 'admin@donatie.eu'
on conflict (id) do update
  set is_admin = true,
      email = excluded.email,
      updated_at = now();

-- Optioneel: ook raw_app_meta_data.role='admin' zetten (dubbele-laag)
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb)
                        || jsonb_build_object('role','admin')
where lower(email) = 'admin@donatie.eu';

-- 2) Hard-lock: alleen exact admin@donatie.eu kan `is_platform_admin()` passeren.
--    Extra veiligheid: is_admin = true op een ander profiel geeft GEEN toegang.
create or replace function public.is_platform_admin(p_uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from auth.users au
    left join public.profiles p on p.id = au.id
    where au.id = p_uid
      and lower(coalesce(au.email, p.email, '')) = 'admin@donatie.eu'
      and (
        coalesce(au.raw_app_meta_data->>'role', '') = 'admin'
        or coalesce(p.is_admin, false) = true
      )
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to anon, authenticated;

-- 3) Veiligheid: verwijder per ongeluk toegekende is_admin op andere profielen.
update public.profiles
set is_admin = false
where is_admin = true
  and lower(coalesce(email,'')) <> 'admin@donatie.eu';

-- 4) Sanity check — laat één rij zien met 'OK'
select
  case
    when exists (
      select 1 from auth.users au
      join public.profiles p on p.id = au.id
      where lower(au.email) = 'admin@donatie.eu' and p.is_admin
    )
    then '✅ admin@donatie.eu is live-klaar (Supabase Auth + profiles.is_admin = true)'
    else '❌ admin@donatie.eu heeft nog geen auth-user. Maak hem eerst aan via Dashboard → Authentication → Users.'
  end as status;
