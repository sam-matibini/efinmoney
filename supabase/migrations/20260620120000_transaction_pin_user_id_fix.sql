-- Fix transaction PIN functions: profiles PK is `id`, auth user is `user_id`.
-- Previous versions used `where id = auth.uid()` so PIN was never saved.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists transaction_pin_hash text,
  add column if not exists transaction_pin_set_at timestamptz,
  add column if not exists transaction_pin_failed_attempts integer not null default 0,
  add column if not exists transaction_pin_locked_until timestamptz;

create or replace function public.has_transaction_pin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select transaction_pin_hash is not null from public.profiles where user_id = auth.uid()),
    false
  );
$$;

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
   where user_id = v_uid;

  if not found then
    return false;
  end if;
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
   where user_id = v_uid;

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
     where user_id = v_uid;
    return jsonb_build_object('ok', true, 'locked', false, 'attempts_left', 5);
  end if;

  v_failed := coalesce(v_failed, 0) + 1;
  if v_failed >= 5 then
    update public.profiles
       set transaction_pin_failed_attempts = v_failed,
           transaction_pin_locked_until = now() + interval '15 minutes'
     where user_id = v_uid;
    return jsonb_build_object('ok', false, 'locked', true,
      'locked_until', now() + interval '15 minutes', 'attempts_left', 0);
  else
    update public.profiles
       set transaction_pin_failed_attempts = v_failed
     where user_id = v_uid;
    return jsonb_build_object('ok', false, 'locked', false, 'attempts_left', 5 - v_failed);
  end if;
end;
$$;

revoke all on function public.has_transaction_pin() from public, anon;
revoke all on function public.set_transaction_pin(text) from public, anon;
revoke all on function public.verify_transaction_pin(text) from public, anon;
grant execute on function public.has_transaction_pin() to authenticated;
grant execute on function public.set_transaction_pin(text) to authenticated;
grant execute on function public.verify_transaction_pin(text) to authenticated;
