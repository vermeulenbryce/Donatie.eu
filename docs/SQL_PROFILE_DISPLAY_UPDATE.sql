-- Profiel: voornaam, achternaam, anonimiteit op ranglijst → public.profiles (RLS-veilig via SECURITY DEFINER)
-- Voer uit in Supabase SQL Editor (na public.profiles bestaat).

create or replace function public.update_my_profile_display(
  p_first_name text,
  p_last_name text default null,
  p_anonymous boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if coalesce(trim(p_first_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'first_name_required');
  end if;

  update public.profiles
  set
    first_name = trim(p_first_name),
    last_name = nullif(trim(coalesce(p_last_name, '')), ''),
    anonymous = coalesce(p_anonymous, false),
    updated_at = now()
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_my_profile_display(text, text, boolean) from public;
grant execute on function public.update_my_profile_display(text, text, boolean) to authenticated;

comment on function public.update_my_profile_display(text, text, boolean) is
  'Werkt naam en anonymous-vlag bij; nodig voor live ranglijst (get_public_leaderboard).';
