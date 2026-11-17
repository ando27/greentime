-- EMERGENCY UNDO for 20261117_p2b_tighten_rls.sql.
-- Puts back the pre-P2 behaviour: any signed-in user can read and write crew
-- data. Only run this if the tightened rules break the app.

drop trigger if exists members_guard on public.members;
drop trigger if exists groups_guard on public.groups;

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
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_delete', t);
  end loop;
end $$;

create policy user_profiles_select on public.user_profiles for select to authenticated using (true);
create policy user_profiles_insert on public.user_profiles for insert to authenticated with check (id = (select auth.uid()));
create policy user_profiles_update on public.user_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy user_profiles_delete on public.user_profiles for delete to authenticated using (id = (select auth.uid()));
