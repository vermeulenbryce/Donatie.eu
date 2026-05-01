-- ═══════════════════════════════════════════════════════════════════════════
-- Welkomstbericht in site-inbox (Meldingen / account Inbox) voor nieuwe accounts.
-- Voer uit in Supabase SQL Editor na deploy van de app die `ensure_signup_welcome_notification` aanroept.
--
-- Pas v_min_created aan naar het UTC-moment van livegang als je alleen accounts
-- vanaf die release wilt (bestaande gebruikers krijgen geen retroactieve welkomst).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.ensure_signup_welcome_notification()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  -- Alleen auth.users aangemaakt vanaf dit tijdstip (UTC). Wijzig bij productie-release indien nodig.
  v_min_created constant timestamptz := '2026-04-24 00:00:00+00';
  v_user_created timestamptz;
begin
  if v_uid is null then
    return;
  end if;

  select u.created_at into v_user_created
  from auth.users u
  where u.id = v_uid;

  if v_user_created is null or v_user_created < v_min_created then
    return;
  end if;

  if exists (
    select 1
    from public.site_notifications sn
    where sn.target_user_id = v_uid
      and sn.type = 'push'
      and sn.data @> '{"signup_welcome": true}'::jsonb
  ) then
    return;
  end if;

  insert into public.site_notifications (
    type,
    target_user_id,
    title,
    body,
    icon,
    data
  ) values (
    'push',
    v_uid,
    'Welkom bij Donatie.eu',
    E'Goed dat je een account hebt!\n\n' ||
    E'Je maakt nu deel uit van een platform waar donateurs en goede doelen elkaar vinden: ' ||
    E'elke bijdrage helpt projecten concreet vooruit — transparant en met echte impact. ' ||
    E'Ontdek doelen die bij je passen, volg waar jouw steun toe doet en spaar punten. Samen bouwen we aan meer goed voor wie het nodig heeft.',
    '🎉',
    jsonb_build_object('signup_welcome', true)
  );
end;
$$;

comment on function public.ensure_signup_welcome_notification() is
  'Idempotent welkom-push in inbox voor nieuwe gebruikers (site_notifications.signup_welcome).';

revoke all on function public.ensure_signup_welcome_notification() from public;
grant execute on function public.ensure_signup_welcome_notification() to authenticated;
