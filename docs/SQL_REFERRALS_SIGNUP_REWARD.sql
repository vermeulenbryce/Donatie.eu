-- ═══════════════════════════════════════════════════════════════════════════
-- Verwijsprogramma: persoonlijke code op profiel, beloning ±100 pts bij signup.
-- Voer uit in Supabase SQL Editor na deploy van de client die referral_my_code gebruikt.
-- ═══════════════════════════════════════════════════════════════════════════

-- Kolommen op profielen
alter table public.profiles
  add column if not exists referral_my_code text;

alter table public.profiles
  add column if not exists referred_by_user_id uuid references public.profiles(id) on delete set null;

-- Unieke verwijzerscode (meerdere null toegestaan vóór backfill — daarna gevuld)
create unique index if not exists idx_profiles_referral_my_code_unique
  on public.profiles (referral_my_code)
  where referral_my_code is not null;

-- Automatisch 6‑teken code toewijzen bij eerste insert (geen input van client nodig)
create or replace function public.profiles_assign_referral_my_code()
returns trigger
language plpgsql
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  cand text;
  attempts int := 0;
begin
  if new.referral_my_code is not null and length(trim(new.referral_my_code)) > 0 then
    new.referral_my_code := upper(trim(new.referral_my_code));
    return new;
  end if;
  loop
    cand := '';
    for i in 1..6 loop
      cand := cand || substr(chars, (floor(random() * length(chars))::int + 1)::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.profiles p where p.referral_my_code = cand
    );
    attempts := attempts + 1;
    if attempts > 80 then
      raise exception 'referral_my_code exhausted retries';
    end if;
  end loop;
  new.referral_my_code := cand;
  return new;
end;
$$;

drop trigger if exists trg_profiles_assign_referral_my_code on public.profiles;

create trigger trg_profiles_assign_referral_my_code
  before insert on public.profiles
  for each row
  execute function public.profiles_assign_referral_my_code();

-- Eenmalig: bestaande profielen zonder code vullen (UPDATE triggert geen BEFORE INSERT — losse stap)
do $$
declare
  r record;
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  cand text;
  attempts int;
  ok boolean;
begin
  for r in select id from public.profiles where referral_my_code is null or trim(referral_my_code) = '' loop
    ok := false;
    attempts := 0;
    while not ok loop
      cand := '';
      for i in 1..6 loop
        cand := cand || substr(chars, (floor(random() * length(chars))::int + 1)::int, 1);
      end loop;
      if not exists (select 1 from public.profiles p where p.referral_my_code = cand) then
        update public.profiles set referral_my_code = cand, updated_at = coalesce(updated_at, now()) where id = r.id;
        ok := true;
      end if;
      attempts := attempts + 1;
      exit when attempts > 100;
    end loop;
  end loop;
end $$;

-- Beloning bij registratie via geldige code: referee +100; referrer +100 maar maximaal voor 5 uitgenodigde accounts (daarna referrer +0).
create or replace function public.claim_referral_signup_reward(p_referrer_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := regexp_replace(upper(trim(coalesce(p_referrer_code, ''))), '[^A-Z0-9]', '', 'g');
  v_referrer uuid;
  v_ref_by uuid;
  v_referrer_existing int;
  v_bonus int := 100;
  v_cap constant int := 5;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if length(v_code) <> 6 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_format');
  end if;

  select id into v_referrer
  from public.profiles
  where referral_my_code = v_code;

  if v_referrer is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;
  if v_referrer = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  select referred_by_user_id into v_ref_by
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if v_ref_by is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  select count(*)::int into v_referrer_existing
  from public.profiles p
  where p.referred_by_user_id = v_referrer;

  update public.profiles
  set
    referred_by_user_id = v_referrer,
    points = coalesce(points, 0) + v_bonus,
    updated_at = now()
  where id = v_uid;

  if v_referrer_existing < v_cap then
    update public.profiles
    set
      points = coalesce(points, 0) + v_bonus,
      updated_at = now()
    where id = v_referrer;
    return jsonb_build_object(
      'ok', true,
      'bonus_referee', v_bonus,
      'bonus_referrer', v_bonus,
      'referrer_capped', false
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'bonus_referee', v_bonus,
    'bonus_referrer', 0,
    'referrer_capped', true,
    'reason', 'referrer_invite_cap'
  );
end;
$$;

revoke all on function public.claim_referral_signup_reward(text) from public;
grant execute on function public.claim_referral_signup_reward(text) to authenticated;

-- Stats voor dashboard (telt hoeveel accounts via jouw link/code zijn gekomen)
create or replace function public.get_my_referral_invite_stats()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'invite_count', ic.c,
    'rewarded_invites', least(ic.c, 5),
    'invite_cap', 5,
    'points_from_invites', least(ic.c, 5) * 100
  )
  from (
    select coalesce((
      select count(*)::int from public.profiles p
      where p.referred_by_user_id = auth.uid()
    ), 0) as c
  ) ic;
$$;

revoke all on function public.get_my_referral_invite_stats() from public;
grant execute on function public.get_my_referral_invite_stats() to authenticated;
