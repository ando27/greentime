-- Upgrades the EXISTING GreenTime database in place to match supabase/schema.sql.
-- Keeps all data: nothing is dropped or deleted. Checked beforehand that no
-- existing row breaks any of the new rules.
-- (For a brand-new empty project, run supabase/schema.sql instead.)

-- 1. Required columns and defaults
alter table public.groups       alter column created_at set not null;
alter table public.members      alter column group_id set not null,
                                alter column is_admin set not null,
                                alter column joined_at set not null;
alter table public.availability alter column member_id set not null,
                                alter column group_id set not null,
                                alter column time_of_day set not null,
                                alter column created_at set not null;
alter table public.events       alter column group_id set not null,
                                alter column created_at set not null;
alter table public.rsvps        alter column event_id set not null,
                                alter column member_id set not null,
                                alter column group_id set not null,
                                alter column auto_rsvp set not null,
                                alter column updated_at set not null;
update public.bail_log set amount_owed = 0 where amount_owed is null;
alter table public.bail_log     alter column event_id set not null,
                                alter column member_id set not null,
                                alter column group_id set not null,
                                alter column bailed_at set not null,
                                alter column amount_owed set default 0,
                                alter column amount_owed set not null;
alter table public.user_profiles alter column created_at set not null,
                                 alter column updated_at set not null;

-- 2. New rules (unique constraints are the important ones)
alter table public.members  add constraint members_group_user_unique unique (group_id, user_id);
alter table public.bail_log add constraint bail_log_event_member_unique unique (event_id, member_id);

alter table public.groups   add constraint groups_name_check check (char_length(btrim(name)) between 1 and 80),
                            add constraint groups_invite_code_check check (invite_code ~ '^[A-Z0-9]{6}$');
alter table public.members  add constraint members_name_check check (char_length(btrim(name)) between 1 and 80),
                            add constraint members_home_lat_check check (home_lat between -90 and 90),
                            add constraint members_home_lng_check check (home_lng between -180 and 180);
alter table public.events   add constraint events_course_name_check check (char_length(btrim(course_name)) > 0),
                            add constraint events_spots_check check (spots > 0),
                            add constraint events_greens_fee_check check (greens_fee is null or greens_fee >= 0),
                            add constraint events_cutoff_hours_check check (cutoff_hours >= 0);
alter table public.bail_log add constraint bail_log_amount_owed_check check (amount_owed >= 0);
alter table public.user_profiles
                            add constraint user_profiles_display_name_check check (char_length(btrim(display_name)) between 1 and 80),
                            add constraint user_profiles_home_lat_check check (home_lat between -90 and 90),
                            add constraint user_profiles_home_lng_check check (home_lng between -180 and 180);

-- Removing a member keeps the events they created (was: deleted them)
alter table public.events drop constraint events_created_by_fkey,
  add constraint events_created_by_fkey foreign key (created_by) references public.members(id) on delete set null;

-- 3. Indexes
create index if not exists members_user_id_idx       on public.members (user_id);
create index if not exists members_group_id_idx      on public.members (group_id);
create index if not exists availability_group_id_idx on public.availability (group_id);
create index if not exists events_group_id_idx       on public.events (group_id);
create index if not exists rsvps_group_id_idx        on public.rsvps (group_id);
create index if not exists bail_log_group_id_idx     on public.bail_log (group_id);
create index if not exists rsvps_member_id_idx       on public.rsvps (member_id);
create index if not exists bail_log_member_id_idx    on public.bail_log (member_id);
create index if not exists suggestion_upvotes_user_id_idx on public.suggestion_upvotes (user_id);

-- 4. Profile helper: now returns the saved row, runs as the caller
drop function if exists public.upsert_user_profile(text, double precision, double precision, text);
create function public.upsert_user_profile(
  p_display_name text, p_home_lat double precision, p_home_lng double precision, p_home_label text
) returns public.user_profiles
language plpgsql security invoker set search_path = public
as $$
declare result public.user_profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to save a profile.';
  end if;
  insert into public.user_profiles (id, display_name, home_lat, home_lng, home_label)
  values (auth.uid(), btrim(p_display_name), p_home_lat, p_home_lng, p_home_label)
  on conflict (id) do update
    set display_name = excluded.display_name, home_lat = excluded.home_lat,
        home_lng = excluded.home_lng, home_label = excluded.home_label, updated_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.upsert_user_profile(text, double precision, double precision, text) from public, anon;
grant execute on function public.upsert_user_profile(text, double precision, double precision, text) to authenticated;

-- 5. Permissions: signed-in users only (guests sign in anonymously)
revoke all on public.groups, public.members, public.availability, public.events, public.rsvps,
  public.bail_log, public.user_profiles, public.suggestions, public.suggestion_upvotes from anon;
grant select, insert, update, delete on public.groups, public.members, public.availability, public.events,
  public.rsvps, public.bail_log, public.user_profiles, public.suggestions, public.suggestion_upvotes to authenticated;

-- 6. Policies: replace the old incomplete set with the full set from schema.sql.
--    The old set had no delete on members/bail_log/groups and no update on
--    availability/bail_log, so those writes were silently ignored.
do $$
declare r record; t text;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
    and tablename in ('groups','members','availability','events','rsvps','bail_log','user_profiles','suggestions','suggestion_upvotes')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  foreach t in array array['groups','members','availability','events','rsvps','bail_log','suggestions','suggestion_upvotes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_delete', t);
  end loop;
end $$;

alter table public.user_profiles enable row level security;
create policy user_profiles_select on public.user_profiles for select to authenticated using (true);
create policy user_profiles_insert on public.user_profiles for insert to authenticated with check (id = (select auth.uid()));
create policy user_profiles_update on public.user_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy user_profiles_delete on public.user_profiles for delete to authenticated using (id = (select auth.uid()));
