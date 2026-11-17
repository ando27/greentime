-- P2 step C (additive): lets a crew admin replace the crew's invite code.
-- The old code and any old invite links stop working immediately.

create or replace function public.regenerate_invite_code(p_group_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only crew admins can change the invite code.';
  end if;

  -- 6 characters, no look-alikes (no I, O, 0, 1). Retry if the code is taken.
  for attempt in 1..20 loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    begin
      update public.groups set invite_code = v_code where id = p_group_id;
      return v_code;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  raise exception 'Could not generate an invite code. Please try again.';
end;
$$;

revoke all on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
