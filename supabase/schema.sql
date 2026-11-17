-- ============================================================================
-- GreenTime — full database schema
-- ============================================================================
-- Rebuilds everything from an EMPTY Supabase project in one run.
-- Paste the whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run twice: tables use "if not exists" and policies are re-created.
--
-- Security level: MEMBERS ONLY (P2). A signed-in user, including a guest
-- (anonymous sign-in), can only see and change data in crews they belong to.
-- Signed-out visitors get nothing. Details in section 7.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  invite_code      text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  favorite_courses jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  is_admin   boolean not null default false,
  user_id    uuid references auth.users(id) on delete set null,  -- null = legacy guest
  home_lat   double precision check (home_lat between -90 and 90),
  home_lng   double precision check (home_lng between -180 and 180),
  home_label text,
  joined_at  timestamptz not null default now(),
  -- One member row per user per crew. (Rows with user_id = null are not limited.)
  constraint members_group_user_unique unique (group_id, user_id)
);

create table if not exists public.availability (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  group_id    uuid not null references public.groups(id) on delete cascade,
  avail_date  date not null,
  time_of_day text not null check (time_of_day in ('morning', 'afternoon', 'evening')),
  created_at  timestamptz not null default now(),
  constraint availability_member_date_slot_unique unique (member_id, avail_date, time_of_day)
);

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  created_by   uuid references public.members(id) on delete set null,
  course_name  text not null check (char_length(btrim(course_name)) > 0),
  event_date   date not null,
  tee_time     time not null,
  spots        int not null default 4 check (spots > 0),
  greens_fee   numeric(8,2) check (greens_fee is null or greens_fee >= 0),
  cutoff_hours int not null default 24 check (cutoff_hours >= 0),
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.rsvps (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  group_id     uuid not null references public.groups(id) on delete cascade,
  status       text not null check (status in ('in', 'out')),
  auto_rsvp    boolean not null default false,
  confirmed_at timestamptz,
  updated_at   timestamptz not null default now(),
  constraint rsvps_event_member_unique unique (event_id, member_id)
);

create table if not exists public.bail_log (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  group_id    uuid not null references public.groups(id) on delete cascade,
  bailed_at   timestamptz not null default now(),
  amount_owed numeric(8,2) not null default 0 check (amount_owed >= 0),
  -- One bail per member per event (backstop for the app's own dedup).
  constraint bail_log_event_member_unique unique (event_id, member_id)
);

create table if not exists public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  home_lat     double precision check (home_lat between -90 and 90),
  home_lng     double precision check (home_lng between -180 and 180),
  home_label   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.suggestions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  display_name text,
  title        text not null check (char_length(btrim(title)) > 0),
  description  text,
  upvotes      integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.suggestion_upvotes (
  id            uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  constraint suggestion_upvotes_unique unique (suggestion_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------

create index if not exists members_user_id_idx       on public.members (user_id);
create index if not exists members_group_id_idx      on public.members (group_id);
create index if not exists availability_group_id_idx on public.availability (group_id);
create index if not exists events_group_id_idx       on public.events (group_id);
create index if not exists rsvps_group_id_idx        on public.rsvps (group_id);
create index if not exists bail_log_group_id_idx     on public.bail_log (group_id);
create index if not exists rsvps_member_id_idx       on public.rsvps (member_id);
create index if not exists bail_log_member_id_idx    on public.bail_log (member_id);
create index if not exists suggestion_upvotes_user_id_idx on public.suggestion_upvotes (user_id);

-- ----------------------------------------------------------------------------
-- 3. Profile helper (called from the app as supabase.rpc('upsert_user_profile'))
-- ----------------------------------------------------------------------------
-- Creates or updates the signed-in user's own profile row and returns it.

drop function if exists public.upsert_user_profile(text, double precision, double precision, text);

create function public.upsert_user_profile(
  p_display_name text,
  p_home_lat     double precision,
  p_home_lng     double precision,
  p_home_label   text
)
returns public.user_profiles
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.user_profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to save a profile.';
  end if;

  insert into public.user_profiles (id, display_name, home_lat, home_lng, home_label)
  values (auth.uid(), btrim(p_display_name), p_home_lat, p_home_lng, p_home_label)
  on conflict (id) do update
    set display_name = excluded.display_name,
        home_lat     = excluded.home_lat,
        home_lng     = excluded.home_lng,
        home_label   = excluded.home_label,
        updated_at   = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.upsert_user_profile(text, double precision, double precision, text) from public, anon;
grant execute on function public.upsert_user_profile(text, double precision, double precision, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Table permissions
-- ----------------------------------------------------------------------------
-- Signed-in users (including guests) go through the "authenticated" role.
-- Visitors who are not signed in ("anon") get nothing.

revoke all on
  public.groups, public.members, public.availability, public.events,
  public.rsvps, public.bail_log, public.user_profiles,
  public.suggestions, public.suggestion_upvotes
from anon;

grant select, insert, update, delete on
  public.groups, public.members, public.availability, public.events,
  public.rsvps, public.bail_log, public.user_profiles,
  public.suggestions, public.suggestion_upvotes
to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Row Level Security: on for every table
-- ----------------------------------------------------------------------------

alter table public.groups             enable row level security;
alter table public.members            enable row level security;
alter table public.availability       enable row level security;
alter table public.events             enable row level security;
alter table public.rsvps              enable row level security;
alter table public.bail_log           enable row level security;
alter table public.user_profiles      enable row level security;
alter table public.suggestions        enable row level security;
alter table public.suggestion_upvotes enable row level security;

-- ----------------------------------------------------------------------------
-- 6. Security helper functions and RPCs (create crew, join by code)
-- ----------------------------------------------------------------------------
-- "security definer" means the function runs with the database owner's rights
-- instead of the caller's. That is what lets a non-member look up a crew by
-- invite code even though non-members cannot read the tables. Each function
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

-- ----------------------------------------------------------------------------
-- 7. Policies: who can read and write which rows
-- ----------------------------------------------------------------------------
--   * You can only see and change data in crews you belong to.
--   * You can only change your own member row, availability, RSVPs and bails.
--   * Only crew admins can rename/delete the crew, remove members, or change
--     who is an admin.
--   * Crews are created and joined only through create_group() and
--     join_group_by_code(), never by writing to the tables directly.
--   * Profiles: readable by you and your crewmates, writable only by you.

-- ── Guards for columns that policies alone can't protect ────────────────────
-- (auth.uid() is null for the SQL editor / service role, which are not limited.)

create or replace function public.members_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.group_id is distinct from old.group_id or new.user_id is distinct from old.user_id then
    raise exception 'A membership cannot be moved to another crew or person.';
  end if;
  if new.is_admin is distinct from old.is_admin and not public.is_group_admin(old.group_id) then
    raise exception 'Only crew admins can change who is an admin.';
  end if;
  return new;
end;
$$;

drop trigger if exists members_guard on public.members;
create trigger members_guard before update on public.members
  for each row execute function public.members_guard();

create or replace function public.groups_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (new.name is distinct from old.name or new.invite_code is distinct from old.invite_code)
     and not public.is_group_admin(old.id) then
    raise exception 'Only crew admins can change the crew name or invite code.';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_guard on public.groups;
create trigger groups_guard before update on public.groups
  for each row execute function public.groups_guard();

revoke all on function public.members_guard() from public, anon, authenticated;
revoke all on function public.groups_guard() from public, anon, authenticated;

-- ── Remove every existing policy on our tables ──────────────────────────────
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
    and tablename in ('groups','members','availability','events','rsvps','bail_log','user_profiles','suggestions','suggestion_upvotes')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── groups ──────────────────────────────────────────────────────────────────
-- No insert policy on purpose: crews are created by create_group().
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));
-- Any member may update (favorite courses); groups_guard keeps name and
-- invite code admin-only.
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_member(id)) with check (public.is_group_member(id));
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_group_admin(id));

-- ── members ─────────────────────────────────────────────────────────────────
-- No insert policy on purpose: members are added by create_group() and
-- join_group_by_code().
create policy members_select on public.members for select to authenticated
  using (public.is_group_member(group_id));
create policy members_update on public.members for update to authenticated
  using (user_id = (select auth.uid()) or public.is_group_admin(group_id))
  with check (user_id = (select auth.uid()) or public.is_group_admin(group_id));
-- Leave a crew yourself, or be removed by an admin
create policy members_delete on public.members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_group_admin(group_id));

-- ── availability ────────────────────────────────────────────────────────────
create policy availability_select on public.availability for select to authenticated
  using (public.is_group_member(group_id));
create policy availability_insert on public.availability for insert to authenticated
  with check (public.owns_member_in(member_id, group_id));
create policy availability_update on public.availability for update to authenticated
  using (public.owns_member(member_id)) with check (public.owns_member_in(member_id, group_id));
create policy availability_delete on public.availability for delete to authenticated
  using (public.owns_member(member_id));

-- ── events ──────────────────────────────────────────────────────────────────
create policy events_select on public.events for select to authenticated
  using (public.is_group_member(group_id));
create policy events_insert on public.events for insert to authenticated
  with check (public.owns_member_in(created_by, group_id));
-- The creator or a crew admin
create policy events_update on public.events for update to authenticated
  using (public.is_group_admin(group_id) or public.owns_member(created_by))
  with check (public.is_group_member(group_id));
create policy events_delete on public.events for delete to authenticated
  using (public.is_group_admin(group_id) or public.owns_member(created_by));

-- ── rsvps ───────────────────────────────────────────────────────────────────
create policy rsvps_select on public.rsvps for select to authenticated
  using (public.is_group_member(group_id));
-- Your own RSVP. Admins and the event's creator may also add RSVPs for other
-- members: that is how auto-RSVP works when an event is created.
create policy rsvps_insert on public.rsvps for insert to authenticated
  with check (
    public.owns_member_in(member_id, group_id)
    or public.is_group_admin(group_id)
    or exists (select 1 from public.events e
               where e.id = event_id and e.group_id = rsvps.group_id and public.owns_member(e.created_by))
  );
create policy rsvps_update on public.rsvps for update to authenticated
  using (public.owns_member(member_id)) with check (public.owns_member_in(member_id, group_id));
create policy rsvps_delete on public.rsvps for delete to authenticated
  using (public.owns_member(member_id) or public.is_group_admin(group_id));

-- ── bail_log ────────────────────────────────────────────────────────────────
-- No update policy on purpose: a bail is logged or removed, never edited.
create policy bail_log_select on public.bail_log for select to authenticated
  using (public.is_group_member(group_id));
create policy bail_log_insert on public.bail_log for insert to authenticated
  with check (public.owns_member_in(member_id, group_id));
create policy bail_log_delete on public.bail_log for delete to authenticated
  using (public.owns_member(member_id) or public.is_group_admin(group_id));

-- ── user_profiles ───────────────────────────────────────────────────────────
create policy user_profiles_select on public.user_profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));
create policy user_profiles_insert on public.user_profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy user_profiles_update on public.user_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy user_profiles_delete on public.user_profiles for delete to authenticated
  using (id = (select auth.uid()));

-- ── suggestions (shared by everyone signed in; you edit only your own) ──────
create policy suggestions_select on public.suggestions for select to authenticated using (true);
create policy suggestions_insert on public.suggestions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy suggestions_update on public.suggestions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy suggestions_delete on public.suggestions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy suggestion_upvotes_select on public.suggestion_upvotes for select to authenticated using (true);
create policy suggestion_upvotes_insert on public.suggestion_upvotes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy suggestion_upvotes_delete on public.suggestion_upvotes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Done. Check: Table Editor should show 9 tables, each marked "RLS enabled".
-- ----------------------------------------------------------------------------
