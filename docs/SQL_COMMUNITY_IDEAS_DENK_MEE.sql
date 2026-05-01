-- ═══════════════════════════════════════════════════════════════════════════
-- Denk mee / community-ideeën — live lijst, stemmen (toggle), weeklimiet indienen
-- Vereist: public.profiles, public.set_updated_at() (SQL_ADMIN_LIVE_PHASE1 of vergelijkbaar)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Tabellen
create table if not exists public.community_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text not null,
  category text not null default 'sociaal',
  tag text not null default 'idee'
    check (tag = any (array['idee','poll','winnaar']::text[])),
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_display_name text,
  vote_count integer not null default 0 check (vote_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_ideas_category_chk check (
    category = any (array[
      'natuur','gezondheid','kinderen','dieren','sociaal','innovatie'
    ]::text[])
  ),
  constraint community_ideas_title_len check (char_length(trim(title)) >= 1 and char_length(title) <= 280),
  constraint community_ideas_excerpt_len check (char_length(trim(excerpt)) >= 1 and char_length(excerpt) <= 4000)
);

create index if not exists idx_community_ideas_created_at
  on public.community_ideas (created_at desc);

create index if not exists idx_community_ideas_author_created
  on public.community_ideas (author_id, created_at desc);

create index if not exists idx_community_ideas_vote_count
  on public.community_ideas (vote_count desc);

create table if not exists public.community_idea_votes (
  idea_id uuid not null references public.community_ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create index if not exists idx_community_idea_votes_user
  on public.community_idea_votes (user_id);

-- ── 2) Stemtellers synchroon houden
create or replace function public.trg_community_idea_votes_touch_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_ideas
    set vote_count = vote_count + 1,
        updated_at = now()
    where id = new.idea_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_ideas
    set vote_count = greatest(vote_count - 1, 0),
        updated_at = now()
    where id = old.idea_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_community_idea_votes_ai on public.community_idea_votes;
drop trigger if exists trg_community_idea_votes_ad on public.community_idea_votes;

create trigger trg_community_idea_votes_aud
  after insert or delete on public.community_idea_votes
  for each row execute function public.trg_community_idea_votes_touch_count();

drop trigger if exists trg_community_ideas_updated_at on public.community_ideas;
create trigger trg_community_ideas_updated_at
  before update on public.community_ideas
  for each row execute function public.set_updated_at();

-- Weekstart maandag 00:00 Europe/Amsterdam (ISO-week)
create or replace function public.week_start_amsterdam()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (
    date_trunc(
      'week',
      (current_timestamp at time zone 'Europe/Amsterdam')
    ) at time zone 'Europe/Amsterdam'
  );
$$;

revoke all on function public.week_start_amsterdam() from public;
grant execute on function public.week_start_amsterdam() to authenticated;

-- ── 3) Puntenconstants (matching marketing + bestaande frontend-gedrag)
-- indien idee +50 aan indiener; +2 bij stem uitbrengen; +10 naar idee-auteur bij elke stem
-- Bij intrekken: symmetrisch terugdraaien

-- ── 4) RPC: idee indienen (max 1 per gebruiker per kalenderweek, maandag start NL)
create or replace function public.submit_community_idea(p_title text, p_excerpt text, p_category text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week timestamptz;
  v_n int;
  v_title text := trim(coalesce(p_title, ''));
  v_excerpt text := trim(coalesce(p_excerpt, ''));
  v_cat text := lower(trim(coalesce(p_category, '')));
  v_display text;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if v_title = '' or v_excerpt = '' then
    return jsonb_build_object('ok', false, 'reason', 'title_excerpt_required');
  end if;
  if length(v_title) > 280 or length(v_excerpt) > 4000 then
    return jsonb_build_object('ok', false, 'reason', 'text_too_long');
  end if;

  if v_cat is null or v_cat = '' then
    v_cat := 'sociaal';
  end if;

  if v_cat <> all (
    array['natuur','gezondheid','kinderen','dieren','sociaal','innovatie']::text[]
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_category');
  end if;

  v_week := public.week_start_amsterdam();

  select count(*)::int into v_n
  from public.community_ideas i
  where i.author_id = v_uid
    and i.created_at >= v_week;

  if v_n >= 1 then
    return jsonb_build_object('ok', false, 'reason', 'weekly_submit_limit');
  end if;

  select nullif(trim(
    coalesce(nullif(trim(p.first_name), ''), split_part(coalesce(au.email, ''), '@', 1)) || ' ' ||
    case
      when coalesce(nullif(trim(p.last_name), ''), '') <> '' then left(trim(p.last_name), 1) || '.'
      else ''
    end
  ), '')
  into v_display
  from public.profiles p
  left join auth.users au on au.id = p.id
  where p.id = v_uid;

  insert into public.community_ideas (title, excerpt, category, tag, author_id, author_display_name)
  values (v_title, v_excerpt, v_cat, 'idee', v_uid, left(coalesce(v_display, 'Deelnemer'), 120))
  returning id into v_id;

  update public.profiles
  set points = greatest(0, coalesce(points, 0) + 50),
      updated_at = now()
  where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'points_awarded_submit', 50
  );
end;
$$;

revoke all on function public.submit_community_idea(text, text, text) from public;
grant execute on function public.submit_community_idea(text, text, text) to authenticated;

-- ── 5) RPC: stem toggle (nog eens klikken = intrekken)
create or replace function public.toggle_community_idea_vote(p_idea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_has boolean;
  v_vc int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select author_id into v_author from public.community_ideas where id = p_idea_id;
  if v_author is null then
    return jsonb_build_object('ok', false, 'reason', 'idea_not_found');
  end if;

  if v_author = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'own_idea');
  end if;

  select exists(
    select 1 from public.community_idea_votes v where v.idea_id = p_idea_id and v.user_id = v_uid
  )
  into v_has;

  if v_has then
    delete from public.community_idea_votes where idea_id = p_idea_id and user_id = v_uid;

    update public.profiles
    set points = greatest(0, coalesce(points, 0) - 2),
        updated_at = now()
    where id = v_uid;

    update public.profiles
    set points = greatest(0, coalesce(points, 0) - 10),
        updated_at = now()
    where id = v_author;

    select vote_count into v_vc from public.community_ideas where id = p_idea_id;

    return jsonb_build_object('ok', true, 'voted', false, 'vote_count', coalesce(v_vc, 0));
  end if;

  insert into public.community_idea_votes (idea_id, user_id)
  values (p_idea_id, v_uid);

  update public.profiles
  set points = greatest(0, coalesce(points, 0) + 2),
      updated_at = now()
  where id = v_uid;

  update public.profiles
  set points = greatest(0, coalesce(points, 0) + 10),
      updated_at = now()
  where id = v_author;

  select vote_count into v_vc from public.community_ideas where id = p_idea_id;

  return jsonb_build_object('ok', true, 'voted', true, 'vote_count', coalesce(v_vc, 0));
end;
$$;

revoke all on function public.toggle_community_idea_vote(uuid) from public;
grant execute on function public.toggle_community_idea_vote(uuid) to authenticated;

-- ── 6) RLS
alter table public.community_ideas enable row level security;
alter table public.community_idea_votes enable row level security;

drop policy if exists community_ideas_select_public on public.community_ideas;
create policy community_ideas_select_public
  on public.community_ideas
  for select
  to anon, authenticated
  using (true);

-- Geen inserts/updates via PostgREST; alleen RPC (security definer bypassed table RLS for owner paths)

drop policy if exists community_idea_votes_select_own on public.community_idea_votes;
create policy community_idea_votes_select_own
  on public.community_idea_votes
  for select
  to authenticated
  using (user_id = auth.uid());

-- Realtime voor live updates op de homepage-sectie
do $$ begin
  alter publication supabase_realtime add table public.community_ideas;
exception when duplicate_object then null; when undefined_table then null; end $$;

-- Direct table writes blokkeren; alleen RPC
revoke insert, update, delete on public.community_ideas from authenticated, anon;
revoke insert, update, delete on public.community_idea_votes from authenticated, anon;

grant select on public.community_ideas to anon, authenticated;
grant select on public.community_idea_votes to authenticated;
