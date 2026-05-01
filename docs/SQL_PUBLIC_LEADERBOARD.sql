-- Publieke ranglijst (iedereen ziet gemaskeerde namen + actieve punten + totaal gedoneerd uit profiles)
-- Voer uit in Supabase SQL Editor na profiles + auth.users bestaan.
-- Vereist dezelfde naam-maskering als get_public_homepage_stats (geen e-mail lekken).

create or replace function public.get_public_leaderboard(
  p_kind text default 'individuen',
  p_limit int default 200
)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, 'individuen')));
  v_lim int := greatest(1, least(coalesce(p_limit, 200), 500));
  v_uid uuid := auth.uid();
  v_rows json;
begin
  if v_kind not in ('individuen', 'bedrijven', 'influencers') then
    v_kind := 'individuen';
  end if;

  select coalesce(json_agg(row_to_json(sub) order by sub.rank), '[]'::json)
    into v_rows
  from (
    select
      row_number() over (order by coalesce(p.points, 0) desc, coalesce(p.total_donated, 0) desc) as rank,
      coalesce(p.points, 0)::int as points,
      coalesce(p.total_donated, 0)::numeric as total_donated,
      case when coalesce(p.anonymous, false) then true else false end as is_anonymous,
      (v_uid is not null and p.id = v_uid) as is_me,
      (coalesce(p.points, 0) >= 1500) as elite,
      case
        when coalesce(p.anonymous, false) and not (v_uid is not null and p.id = v_uid) then 'Anoniem'
        else coalesce(
          nullif(
            trim(
              coalesce(nullif(trim(p.first_name), ''), split_part(coalesce(au.email, ''), '@', 1)) || ' ' ||
              case
                when coalesce(nullif(trim(p.last_name), ''), '') <> ''
                  then left(trim(p.last_name), 1) || '.'
                else ''
              end
            ),
            ''
          ),
          'Donateur'
        )
      end as label,
      case
        when coalesce(p.anonymous, false) and not (v_uid is not null and p.id = v_uid) then '?'
        else upper(
          left(
            coalesce(
              nullif(trim(p.first_name), ''),
              split_part(coalesce(au.email, ''), '@', 1),
              '?'
            ),
            1
          )
        )
      end as initial
    from public.profiles p
    left join auth.users au on au.id = p.id
    where
      (coalesce(p.points, 0) > 0 or coalesce(p.total_donated, 0) > 0)
      and (
        (v_kind = 'individuen' and coalesce(p.account_type::text, 'individu') in ('individu'))
        or (v_kind = 'bedrijven' and p.account_type::text = 'bedrijf')
        or (v_kind = 'influencers' and p.account_type::text = 'influencer')
      )
    order by coalesce(p.points, 0) desc, coalesce(p.total_donated, 0) desc
    limit v_lim
  ) sub;

  return coalesce(v_rows, '[]'::json);
end;
$$;

revoke all on function public.get_public_leaderboard(text, int) from public;
grant execute on function public.get_public_leaderboard(text, int) to anon, authenticated;

comment on function public.get_public_leaderboard(text, int) is
  'Publieke ranglijst per account_type: rank, punten (actief op profiel), total_donated, label zonder PII, is_me voor ingelogde gebruiker.';

-- ── Verificatie (handmatig in SQL Editor) ───────────────────────────────────
-- select public.get_public_leaderboard('individuen', 20);
-- select public.get_public_leaderboard('bedrijven', 20);
-- select public.get_public_leaderboard('influencers', 20);
--
-- Pending vs actief (ingelogd als testuser):
-- select public.get_my_pending_points();
-- select public.get_my_pending_community_points();
--
-- Donaties in wachtrij (service role of eigenaar via eigen policies):
-- select id, status, donor_points_status, donor_points_eligible_at, donor_community_points_status, donor_community_points_eligible_at
-- from public.donations
-- where status = 'paid'
--   and (donor_points_status = 'pending' or donor_community_points_status = 'pending')
-- order by created_at desc
-- limit 20;
