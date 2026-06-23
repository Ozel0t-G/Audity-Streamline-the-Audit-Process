-- 007_customer_contacts.sql
-- Extended customer master data (address / website / notes) + structured contacts.
-- Idempotent.

alter table customers add column if not exists address text;
alter table customers add column if not exists website text;
alter table customers add column if not exists notes text;

create table if not exists customer_contacts (
  id uuid primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_contacts_customer_id_idx
  on customer_contacts (customer_id);
