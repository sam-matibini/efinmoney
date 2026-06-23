-- Fix: pgcrypto (crypt/gen_salt) lives in the `extensions` schema on Supabase,
-- so the PIN functions must include it in their search_path.

create or replace function public.set_transaction_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  update public.profiles
     set transaction_pin_hash = crypt(p_pin, gen_salt('bf')),
         transaction_pin_set_at = now(),
         transaction_pin_failed_attempts = 0,
         transaction_pin_locked_until = null
   where id = v_uid;

  return true;
end;
$$;

create or replace function public.verify_transaction_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_failed integer;
  v_locked timestamptz;
  v_match boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select transaction_pin_hash, transaction_pin_failed_attempts, transaction_pin_locked_until
    into v_hash, v_failed, v_locked
    from public.profiles
   where id = v_uid;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'no_pin', true, 'locked', false, 'attempts_left', 5);
  end if;

  if v_locked is not null and v_locked > now() then
    return jsonb_build_object('ok', false, 'locked', true, 'locked_until', v_locked, 'attempts_left', 0);
  end if;

  v_match := (v_hash = crypt(coalesce(p_pin, ''), v_hash));

  if v_match then
    update public.profiles
       set transaction_pin_failed_attempts = 0,
           transaction_pin_locked_until = null
     where id = v_uid;
    return jsonb_build_object('ok', true, 'locked', false, 'attempts_left', 5);
  end if;

  v_failed := coalesce(v_failed, 0) + 1;
  if v_failed >= 5 then
    update public.profiles
       set transaction_pin_failed_attempts = v_failed,
           transaction_pin_locked_until = now() + interval '15 minutes'
     where id = v_uid;
    return jsonb_build_object('ok', false, 'locked', true,
      'locked_until', now() + interval '15 minutes', 'attempts_left', 0);
  else
    update public.profiles
       set transaction_pin_failed_attempts = v_failed
     where id = v_uid;
    return jsonb_build_object('ok', false, 'locked', false, 'attempts_left', 5 - v_failed);
  end if;
end;
$$;

grant execute on function public.set_transaction_pin(text) to authenticated;
grant execute on function public.verify_transaction_pin(text) to authenticated;

-- Sanity check that pgcrypto is reachable now (same search_path fix as above —
-- this anonymous block doesn't inherit the functions' SET search_path).
do $$
begin
  set local search_path = public, extensions;
  perform crypt('1234', gen_salt('bf'));
  raise notice 'pgcrypto reachable: OK';
end $$;
