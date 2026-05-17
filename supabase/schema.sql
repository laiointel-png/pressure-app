-- Pressure MVP schema for Supabase (Postgres)
-- Apply in Supabase SQL editor.
-- This is product guidance, not legal advice.

create extension if not exists "pgcrypto";

-- Core groups
create table if not exists public.groups (
  id text primary key,
  name text not null,
  deadline text not null default '22:00',
  fee_label text not null default 'EUR 10',
  destination_label text not null default 'Platform fee, geen cash-out',
  join_code text not null default '',
  owner_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Members (not necessarily Supabase auth users)
create table if not exists public.members (
  group_id text not null references public.groups(id) on delete cascade,
  user_id text not null,
  display_name text not null,
  initial text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Daily check-ins (per user_id string)
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  user_id text not null,
  display_name text not null default '',
  checks_completed int not null default 0,
  checks_total int not null default 4,
  verified boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists checkins_group_created_at_idx on public.checkins (group_id, created_at desc);

-- Ledger events (miss fees, notes, etc.)
create table if not exists public.ledger (
  id text primary key,
  group_id text not null references public.groups(id) on delete cascade,
  kind text not null default 'note',
  user_id text null,
  display_name text null,
  amount_cents int not null default 0,
  currency text not null default 'eur',
  description text not null default '',
  status text not null default 'ok',
  payment_intent_id text null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_group_created_at_idx on public.ledger (group_id, created_at desc);

-- RLS (MVP): require auth for writes; allow reads for group members by join_code match.
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.checkins enable row level security;
alter table public.ledger enable row level security;

-- Basic: allow authenticated users to read groups (MVP). Tighten later.
create policy "groups_read_auth" on public.groups
for select to authenticated
using (true);

create policy "groups_write_owner" on public.groups
for insert to authenticated
with check (auth.uid() is not null);

create policy "groups_update_owner" on public.groups
for update to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "members_read_auth" on public.members
for select to authenticated
using (true);

create policy "members_write_auth" on public.members
for insert to authenticated
with check (auth.uid() is not null);

create policy "members_update_auth" on public.members
for update to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "checkins_read_auth" on public.checkins
for select to authenticated
using (true);

create policy "checkins_write_auth" on public.checkins
for insert to authenticated
with check (auth.uid() is not null);

create policy "ledger_read_auth" on public.ledger
for select to authenticated
using (true);

create policy "ledger_write_auth" on public.ledger
for insert to authenticated
with check (auth.uid() is not null);

-- Note: for production you should restrict reads by membership and enforce owner/member rules.
