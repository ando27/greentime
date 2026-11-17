-- P2 step B: lock the tables down. Requires step A (the helper functions),
-- and the app code that creates/joins crews through the RPCs.
--
-- After this:
--   * You can only see and change data in crews you belong to.
--   * You can only change your own member row, availability, RSVPs and bails.
--   * Only crew admins can rename/delete the crew, remove members, or change
--     who is an admin.
--   * Crews are created and joined only through create_group() and
--     join_group_by_code(), never by writing to the tables directly.
--   * Profiles: readable by you and your crewmates, writable only by you.
-- To undo: run 20261117_p2b_rollback_open_rls.sql.

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
