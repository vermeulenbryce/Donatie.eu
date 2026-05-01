-- Homepage / hero: publieke statistieken + eigen donaties voor badges (auth)
-- Voer uit in Supabase SQL Editor. Vereist public.donations en public.profiles.
--
-- Realtime (optioneel): Dashboard → Database → Replication → zet aan voor tabellen
-- `donations` en `profiles` zodat de homepage zonder refresh mee kan ticken.

-- ── 1) Publieke aggregaties + top 3 op punten (SECURITY DEFINER: leest alles, lekt geen PII buiten maskering)
create or replace function public.get_public_homepage_stats()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_total numeric := 0;
  v_donors bigint := 0;
  v_causes bigint := 0;
  v_top json := '[]'::json;
  v_uid uuid := auth.uid();
begin
  select coalesce(sum(d.amount::numeric), 0)
    into v_total
  from public.donations d
  where lower(coalesce(d.status::text, '')) = 'paid'
    and d.refunded_at is null;

  select count(*)::bigint
    into v_donors
  from (
    select 1
    from public.donations d
    where lower(coalesce(d.status::text, '')) = 'paid'
      and d.refunded_at is null
      and coalesce(d.donor_user_id, d.donor_id) is not null
    group by coalesce(d.donor_user_id, d.donor_id)
  ) s;

  select count(distinct d.charity_name)::bigint
    into v_causes
  from public.donations d
  where lower(coalesce(d.status::text, '')) = 'paid'
    and d.refunded_at is null
    and coalesce(trim(d.charity_name), '') <> '';

  select coalesce(json_agg(row_to_json(sub) order by sub.rank), '[]'::json)
    into v_top
  from (
    select
      row_number() over (order by coalesce(p.points, 0) desc) as rank,
      coalesce(p.points, 0)::int as points,
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
    where coalesce(p.points, 0) > 0
    order by coalesce(p.points, 0) desc
    limit 3
  ) sub;

  return json_build_object(
    'total_raised', v_total,
    'unique_donors', v_donors,
    'distinct_causes', v_causes,
    'top_donors', coalesce(v_top, '[]'::json)
  );
end;
$$;

revoke all on function public.get_public_homepage_stats() from public;
grant execute on function public.get_public_homepage_stats() to anon, authenticated;

comment on function public.get_public_homepage_stats() is
  'Publieke home/hero stats: totaal betaalde donaties, unieke donateurs, aantal doelen (unieke charity_name), top 3 profielen op punten.';

-- ── 2) Minimale donaties voor badge-logica in de app (alleen ingelogde gebruiker)
create or replace function public.get_my_donations_for_badges()
returns table (
  charity_name text,
  amount numeric,
  donation_day date,
  points_value int,
  is_monthly boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(d.charity_name, '')::text as charity_name,
    coalesce(d.amount::numeric, 0) as amount,
    (d.created_at)::date as donation_day,
    coalesce(d.points_value, 0)::int as points_value,
    case
      when lower(coalesce(d.type::text, '')) in ('maandelijks', 'monthly') then true
      else false
    end as is_monthly
  from public.donations d
  where (d.donor_user_id = auth.uid() or d.donor_id = auth.uid())
    and lower(coalesce(d.status::text, '')) = 'paid'
    and d.refunded_at is null;
$$;

revoke all on function public.get_my_donations_for_badges() from public;
grant execute on function public.get_my_donations_for_badges() to authenticated;

comment on function public.get_my_donations_for_badges() is
  'Betaalde donaties van de huidige gebruiker (compact) voor client-side badge checks.';
