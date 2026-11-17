-- P2 step A: helper functions and RPCs. ADDITIVE ONLY: nothing here changes
-- who can read or write what. Safe to apply before the app code that uses it.
--
-- "security definer" means the function runs with the database owner's
-- rights instead of the caller's. That is what lets a non-member look up a
-- crew by invite code after step B locks the tables down. Each function
-- checks auth.uid() itself and only ever acts for the signed-in user.

-- ── Who-am-I helpers (used by the row level security policies in step B) ────

create or replace function public.is_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.group_id = p_group_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.group_id = p_group_id and m.user_id = (select auth.uid()) and m.is_admin
  );
$$;

-- True when the member row belongs to the signed-in user
create or replace function public.owns_member(p_member_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = p_member_id and m.user_id = (select auth.uid())
  );
$$;

-- Same, and the member row is in the given crew
create or replace function public.owns_member_in(p_member_id uuid, p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = p_member_id and m.group_id = p_group_id and m.user_id = (select auth.uid())
  );
$$;

-- True when the signed-in user and the given user are in at least one crew together
create or replace function public.shares_group_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members mine
    join public.members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

-- ── Create a crew ───────────────────────────────────────────────────────────
-- Makes the crew, generates its invite code, and adds the caller as admin, in
-- one step. Returns the new crew's id.

create or replace function public.create_group(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_profile public.user_profiles;
  v_name    text := btrim(coalesce(p_name, ''));
  v_code    text;
  v_group   uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_profile from public.user_profiles where id = v_uid;
  if not found then
    raise exception 'Set up your profile first.';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Crew name must be 1 to 80 characters.';
  end if;

  -- 6 characters, no look-alikes (no I, O, 0, 1). Retry if the code is taken.
  for attempt in 1..20 loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    begin
      insert into public.groups (name, invite_code) values (v_name, v_code)
        returning id into v_group;
      exit;
    exception when unique_violation then
      v_group := null;
    end;
  end loop;
  if v_group is null then
    raise exception 'Could not generate an invite code. Please try again.';
  end if;

  insert into public.members (group_id, user_id, name, is_admin, home_lat, home_lng, home_label)
  values (v_group, v_uid, v_profile.display_name, true,
          v_profile.home_lat, v_profile.home_lng, v_profile.home_label);

  return v_group;
end;
$$;

-- ── Look at an invite before joining ────────────────────────────────────────
-- Returns one row (crew id, name, member count, whether the caller is already
-- in it), or no rows when the code matches nothing.

create or replace function public.get_invite_preview(p_code text)
returns table (group_id uuid, group_name text, member_count integer, already_member boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;
  return query
    select g.id, g.name,
           (select count(*)::int from public.members m where m.group_id = g.id),
           exists (select 1 from public.members m where m.group_id = g.id and m.user_id = v_uid)
    from public.groups g
    where g.invite_code = upper(btrim(coalesce(p_code, '')));
end;
$$;

-- ── Join a crew by invite code ──────────────────────────────────────────────
-- Finds the crew and adds the caller as a member in one step. Never creates a
-- second row for the same person: an existing membership is reused, and its
-- home location is filled in from the profile if it was empty.
-- p_display_name is only used when the caller has no profile yet.

create or replace function public.join_group_by_code(p_code text, p_display_name text default null)
returns table (group_id uuid, group_name text, already_member boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := (select auth.uid());
  v_profile  public.user_profiles;
  v_group    public.groups;
  v_existing public.members;
  v_name     text;
  v_inserted integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_group from public.groups g
    where g.invite_code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'Crew not found. Check the code and try again.';
  end if;

  select * into v_profile from public.user_profiles where id = v_uid;
  v_name := coalesce(v_profile.display_name, nullif(btrim(coalesce(p_display_name, '')), ''));
  if v_name is null then
    raise exception 'Enter your name to join.';
  end if;

  select * into v_existing from public.members m
    where m.group_id = v_group.id and m.user_id = v_uid;

  if not found then
    insert into public.members (group_id, user_id, name, is_admin, home_lat, home_lng, home_label)
    values (v_group.id, v_uid, left(v_name, 80), false,
            v_profile.home_lat, v_profile.home_lng, v_profile.home_label)
    on conflict on constraint members_group_user_unique do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      return query select v_group.id, v_group.name, false;
      return;
    end if;
    -- Lost a race with another tap/tab: the row exists now. Reuse it.
    select * into v_existing from public.members m
      where m.group_id = v_group.id and m.user_id = v_uid;
  end if;

  if v_existing.home_lat is null and v_profile.home_lat is not null then
    update public.members
       set home_lat = v_profile.home_lat, home_lng = v_profile.home_lng, home_label = v_profile.home_label
     where id = v_existing.id;
  end if;

  return query select v_group.id, v_group.name, true;
end;
$$;

-- ── Who may call these: signed-in users only ────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_group_member(uuid)', 'public.is_group_admin(uuid)',
    'public.owns_member(uuid)', 'public.owns_member_in(uuid, uuid)',
    'public.shares_group_with(uuid)', 'public.create_group(text)',
    'public.get_invite_preview(text)', 'public.join_group_by_code(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
