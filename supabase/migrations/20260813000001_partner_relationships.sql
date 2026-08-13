-- Partner contacts: CRM contacts per partner
create table if not exists partner_contacts (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references payment_partners(id) on delete cascade,
  name        text not null,
  role        text,
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on partner_contacts(partner_id);

-- Partner agreements: executed contracts per partner
create table if not exists partner_agreements (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references payment_partners(id) on delete cascade,
  type        text not null default 'msa',   -- msa, nda, addendum, sla, other
  status      text not null default 'draft', -- draft, executed, expired, terminated
  title       text,
  file_path   text,   -- path in storage bucket partner-agreements
  signed_at   date,
  expires_at  date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on partner_agreements(partner_id);

-- RLS: authenticated users only (admin gate is handled at app level)
alter table partner_contacts enable row level security;
alter table partner_agreements enable row level security;

create policy "authenticated access partner_contacts"
  on partner_contacts for all
  using (auth.uid() is not null);

create policy "authenticated access partner_agreements"
  on partner_agreements for all
  using (auth.uid() is not null);

-- updated_at triggers
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger partner_contacts_updated_at
  before update on partner_contacts
  for each row execute procedure set_updated_at();

create trigger partner_agreements_updated_at
  before update on partner_agreements
  for each row execute procedure set_updated_at();
