-- ═══════════════════════════════════════════════════════════════
--   FREIGHTLX Persistent Database Schema
--   Run this once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── USERS ─────────────────────────────────────────────────────
-- Links to Supabase auth.users (already managed by Supabase Auth)
-- This table stores extended profile data
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  name          text,
  phone         text,
  role          text not null default 'user' check (role in ('user','admin','super_admin')),
  status        text not null default 'active' check (status in ('active','pending','banned')),
  total_spent   numeric(12,2) default 0,
  shipments_count integer default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ── SHIPMENTS ─────────────────────────────────────────────────
create table if not exists public.shipments (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  origin        text not null,
  destination   text not null,
  carrier       text not null,
  container     text not null,
  price         numeric(12,2) not null default 0,
  status        text not null default 'pending'
                  check (status in ('pending','active','transit','completed','cancelled')),
  status_text   text,
  date          date not null default current_date,
  cargo_type    text,
  commodity_code text,
  source_quote_id text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists shipments_user_idx on public.shipments (user_id);
create index if not exists shipments_status_idx on public.shipments (status);
create index if not exists shipments_created_idx on public.shipments (created_at desc);

-- ── QUOTES ────────────────────────────────────────────────────
create table if not exists public.quotes (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  origin        text not null,
  destination   text not null,
  carrier       text not null,
  container     text not null default '40HC',
  price         numeric(12,2) not null,
  valid_until   date not null,
  status        text not null default 'valid'
                  check (status in ('valid','expired','booked','cancelled')),
  source        text default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists quotes_user_idx on public.quotes (user_id);
create index if not exists quotes_status_idx on public.quotes (status);

-- ── INVOICES ──────────────────────────────────────────────────
create table if not exists public.invoices (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  shipment_id   text references public.shipments(id) on delete set null,
  description   text not null,
  amount        numeric(12,2) not null,
  status        text not null default 'pending'
                  check (status in ('paid','pending','overdue','cancelled')),
  date          date not null default current_date,
  due_date      date,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists invoices_user_idx on public.invoices (user_id);
create index if not exists invoices_status_idx on public.invoices (status);

-- ── DOCUMENTS ─────────────────────────────────────────────────
create table if not exists public.documents (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  shipment_id   text references public.shipments(id) on delete set null,
  name          text not null,
  type          text not null,
  mime          text,
  size          bigint,
  category      text not null default 'other'
                  check (category in ('saber','bl','invoice','origin','msds','photo','other')),
  storage_path  text,
  created_at    timestamptz not null default now()
);
create index if not exists documents_user_idx on public.documents (user_id);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
create table if not exists public.notifications (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in ('success','info','warning','error')),
  text          text not null,
  meta          jsonb,
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists notifs_user_unread on public.notifications (user_id, read);

-- ── ACTIVITY LOG ──────────────────────────────────────────────
create table if not exists public.activity_log (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  details     text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists log_created on public.activity_log (created_at desc);

-- ═══════════════════════════════════════════════════════════════
--   ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles      enable row level security;
alter table public.shipments     enable row level security;
alter table public.quotes        enable row level security;
alter table public.invoices      enable row level security;
alter table public.documents     enable row level security;
alter table public.notifications enable row level security;

-- Drop existing policies if rerunning
drop policy if exists "profiles_self_read"    on public.profiles;
drop policy if exists "profiles_self_update"  on public.profiles;
drop policy if exists "shipments_owner_all"   on public.shipments;
drop policy if exists "quotes_owner_all"      on public.quotes;
drop policy if exists "invoices_owner_all"    on public.invoices;
drop policy if exists "documents_owner_all"   on public.documents;
drop policy if exists "notifs_owner_all"      on public.notifications;

-- Users CRUD their own data
create policy "profiles_self_read"    on public.profiles      for select using (auth.uid() = id);
create policy "profiles_self_update"  on public.profiles      for update using (auth.uid() = id);
create policy "shipments_owner_all"   on public.shipments     for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "quotes_owner_all"      on public.quotes        for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "invoices_owner_all"    on public.invoices      for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents_owner_all"   on public.documents     for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifs_owner_all"      on public.notifications for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admins can read everything
create policy "admins_read_all_profiles" on public.profiles
  for select using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));
create policy "admins_read_all_shipments" on public.shipments
  for select using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));
create policy "admins_read_all_invoices" on public.invoices
  for select using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','super_admin')));

-- ═══════════════════════════════════════════════════════════════
--   TRIGGERS
-- ═══════════════════════════════════════════════════════════════
create or replace function public.set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists profiles_updated   on public.profiles;
drop trigger if exists shipments_updated  on public.shipments;
drop trigger if exists quotes_updated     on public.quotes;
drop trigger if exists invoices_updated   on public.invoices;

create trigger profiles_updated   before update on public.profiles   for each row execute function public.set_updated_at();
create trigger shipments_updated  before update on public.shipments  for each row execute function public.set_updated_at();
create trigger quotes_updated     before update on public.quotes     for each row execute function public.set_updated_at();
create trigger invoices_updated   before update on public.invoices   for each row execute function public.set_updated_at();

-- Auto-create profile when user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
--   STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Storage policies: users can read/write their own files
drop policy if exists "docs_owner_read" on storage.objects;
drop policy if exists "docs_owner_write" on storage.objects;
create policy "docs_owner_read"  on storage.objects for select using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "docs_owner_write" on storage.objects for insert with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════
--   SEED CARRIERS (lookup table)
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.carriers (
  id          uuid primary key default uuid_generate_v4(),
  code        text unique not null,
  name        text not null,
  country     text,
  active      boolean not null default true,
  shipments_count integer default 0,
  created_at  timestamptz not null default now()
);

insert into public.carriers (code, name, country) values
  ('CSCO', 'COSCO',       'China'),
  ('MSCU', 'MSC',         'Switzerland'),
  ('MAEU', 'Maersk',      'Denmark'),
  ('CMDU', 'CMA CGM',     'France'),
  ('HLCU', 'Hapag-Lloyd', 'Germany'),
  ('HDMU', 'HMM',         'South Korea'),
  ('ONEY', 'ONE',         'Japan'),
  ('ARKU', 'Arkas Line',  'Turkey')
on conflict (code) do nothing;

-- ═══════════════════════════════════════════════════════════════
--   DONE — Verify with:
--   select count(*) from public.shipments;
--   select count(*) from public.carriers;
-- ═══════════════════════════════════════════════════════════════
