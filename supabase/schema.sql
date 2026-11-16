-- ============================================================================
-- GreenTime — full database schema
-- ============================================================================
-- Rebuilds everything from an EMPTY Supabase project in one run.
-- Paste the whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run twice: tables use "if not exists" and policies are re-created.
--
-- Security level: OPEN (same behavior as before). Any signed-in user, including
-- guests (anonymous sign-in), can read and write crew data. P2 tightens this.
-- The only locked-down table is user_profiles: you can only write your own row.
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
-- 5. Row Level Security — on for every table, every policy written out
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

-- groups (open to signed-in users; P2 limits to crew members/admins)
drop policy if exists groups_select on public.groups;
drop policy if exists groups_insert on public.groups;
drop policy if exists groups_update on public.groups;
drop policy if exists groups_delete on public.groups;
create policy groups_select on public.groups for select to authenticated using (true);
create policy groups_insert on public.groups for insert to authenticated with check (true);
create policy groups_update on public.groups for update to authenticated using (true) with check (true);
create policy groups_delete on public.groups for delete to authenticated using (true);

-- members
drop policy if exists members_select on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
create policy members_select on public.members for select to authenticated using (true);
create policy members_insert on public.members for insert to authenticated with check (true);
create policy members_update on public.members for update to authenticated using (true) with check (true);
create policy members_delete on public.members for delete to authenticated using (true);

-- availability
drop policy if exists availability_select on public.availability;
drop policy if exists availability_insert on public.availability;
drop policy if exists availability_update on public.availability;
drop policy if exists availability_delete on public.availability;
create policy availability_select on public.availability for select to authenticated using (true);
create policy availability_insert on public.availability for insert to authenticated with check (true);
create policy availability_update on public.availability for update to authenticated using (true) with check (true);
create policy availability_delete on public.availability for delete to authenticated using (true);

-- events
drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;
drop policy if exists events_delete on public.events;
create policy events_select on public.events for select to authenticated using (true);
create policy events_insert on public.events for insert to authenticated with check (true);
create policy events_update on public.events for update to authenticated using (true) with check (true);
create policy events_delete on public.events for delete to authenticated using (true);

-- rsvps
drop policy if exists rsvps_select on public.rsvps;
drop policy if exists rsvps_insert on public.rsvps;
drop policy if exists rsvps_update on public.rsvps;
drop policy if exists rsvps_delete on public.rsvps;
create policy rsvps_select on public.rsvps for select to authenticated using (true);
create policy rsvps_insert on public.rsvps for insert to authenticated with check (true);
create policy rsvps_update on public.rsvps for update to authenticated using (true) with check (true);
create policy rsvps_delete on public.rsvps for delete to authenticated using (true);

-- bail_log
drop policy if exists bail_log_select on public.bail_log;
drop policy if exists bail_log_insert on public.bail_log;
drop policy if exists bail_log_update on public.bail_log;
drop policy if exists bail_log_delete on public.bail_log;
create policy bail_log_select on public.bail_log for select to authenticated using (true);
create policy bail_log_insert on public.bail_log for insert to authenticated with check (true);
create policy bail_log_update on public.bail_log for update to authenticated using (true) with check (true);
create policy bail_log_delete on public.bail_log for delete to authenticated using (true);

-- user_profiles (anyone signed in can read; you can only write your own row)
drop policy if exists user_profiles_select on public.user_profiles;
drop policy if exists user_profiles_insert on public.user_profiles;
drop policy if exists user_profiles_update on public.user_profiles;
drop policy if exists user_profiles_delete on public.user_profiles;
create policy user_profiles_select on public.user_profiles for select to authenticated using (true);
create policy user_profiles_insert on public.user_profiles for insert to authenticated with check (id = (select auth.uid()));
create policy user_profiles_update on public.user_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy user_profiles_delete on public.user_profiles for delete to authenticated using (id = (select auth.uid()));

-- suggestions
drop policy if exists suggestions_select on public.suggestions;
drop policy if exists suggestions_insert on public.suggestions;
drop policy if exists suggestions_update on public.suggestions;
drop policy if exists suggestions_delete on public.suggestions;
create policy suggestions_select on public.suggestions for select to authenticated using (true);
create policy suggestions_insert on public.suggestions for insert to authenticated with check (true);
create policy suggestions_update on public.suggestions for update to authenticated using (true) with check (true);
create policy suggestions_delete on public.suggestions for delete to authenticated using (true);

-- suggestion_upvotes
drop policy if exists suggestion_upvotes_select on public.suggestion_upvotes;
drop policy if exists suggestion_upvotes_insert on public.suggestion_upvotes;
drop policy if exists suggestion_upvotes_update on public.suggestion_upvotes;
drop policy if exists suggestion_upvotes_delete on public.suggestion_upvotes;
create policy suggestion_upvotes_select on public.suggestion_upvotes for select to authenticated using (true);
create policy suggestion_upvotes_insert on public.suggestion_upvotes for insert to authenticated with check (true);
create policy suggestion_upvotes_update on public.suggestion_upvotes for update to authenticated using (true) with check (true);
create policy suggestion_upvotes_delete on public.suggestion_upvotes for delete to authenticated using (true);

-- ----------------------------------------------------------------------------
-- Done. Check: Table Editor should show 9 tables, each marked "RLS enabled".
-- ----------------------------------------------------------------------------
