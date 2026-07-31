-- account_activity: per-user event log (login, KYC, profile changes, etc.)
create table if not exists public.account_activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null,
  description text,
  actor_type  text not null default 'system',
  actor_id    uuid,
  ip_address  text,
  user_agent  text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists account_activity_user_id_idx
  on public.account_activity (user_id, created_at desc);

alter table public.account_activity enable row level security;

-- Users can read their own activity; admins can read all via service role
create policy "users_read_own_activity"
  on public.account_activity for select
  using (auth.uid() = user_id);

-- Only service role / edge functions insert (no direct user insert)
grant select on public.account_activity to authenticated;
grant insert, select on public.account_activity to service_role;

-- Helper function callable from edge functions or triggers
create or replace function public.log_account_activity(
  p_user_id   uuid,
  p_event_type text,
  p_description text default null,
  p_metadata  jsonb default '{}'
) returns void
language plpgsql security definer
as $$
begin
  insert into public.account_activity (user_id, event_type, description, actor_type, metadata)
  values (p_user_id, p_event_type, p_description, 'system', coalesce(p_metadata, '{}'));
end;
$$;
