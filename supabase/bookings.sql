-- FREIGHTLX Bookings & Manual Quote Requests
-- Apply in Supabase SQL Editor

create table if not exists bookings (
  id              text primary key default ('BK-' || substr(md5(random()::text), 1, 10)),
  user_id         uuid references auth.users(id) on delete cascade,
  customer_name   text,
  customer_email  text,
  customer_phone  text,

  -- Route
  origin_port      text not null,
  destination_port text not null,
  carrier          text,
  carrier_logo     text,

  -- Cargo
  container_type   text default '40HC',
  quantity         int  default 1,
  commodity        text,
  is_dangerous     boolean default false,

  -- Dates
  ready_date       date,
  sailing_date     date,
  eta              date,
  transit_days     int,

  -- Pricing
  freight_price    numeric(12,2),
  currency         text default 'USD',
  internal_cost    numeric(12,2),  -- admin only
  margin           numeric(12,2),  -- admin only

  -- Services
  services         jsonb default '[]'::jsonb,
  -- e.g. ["clearance","trucking","saber"]

  -- Status & references
  status           text not null default 'draft_quote',
  booking_number   text,
  carrier_ref      text,
  api_request      jsonb,
  api_response     jsonb,
  source_quote_id  text,
  source_rate_request_id uuid,

  -- Admin ops
  assigned_to      uuid references auth.users(id),
  internal_notes   text,
  customer_notes   text,

  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Status enum:
-- draft_quote · quote_selected · pending_booking · booking_confirmed
-- pending_manual_review · booking_failed · shipment_in_progress · completed · cancelled

create index if not exists idx_bookings_user on bookings(user_id);
create index if not exists idx_bookings_status on bookings(status);
create index if not exists idx_bookings_created on bookings(created_at desc);

-- RLS
alter table bookings enable row level security;

drop policy if exists "bookings_select_own" on bookings;
create policy "bookings_select_own" on bookings
  for select using (user_id = auth.uid());

drop policy if exists "bookings_insert_own" on bookings;
create policy "bookings_insert_own" on bookings
  for insert with check (user_id = auth.uid());

drop policy if exists "bookings_update_own" on bookings;
create policy "bookings_update_own" on bookings
  for update using (user_id = auth.uid());

-- Admin bypass (service role used by backend)
drop policy if exists "bookings_admin_all" on bookings;
create policy "bookings_admin_all" on bookings
  for all using (
    exists(select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
  );

-- Trigger to update updated_at
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_bookings_updated on bookings;
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- Manual Quote Requests (fired when API has no rates)
-- ─────────────────────────────────────────────
create table if not exists manual_quote_requests (
  id              text primary key default ('MQR-' || substr(md5(random()::text), 1, 10)),
  user_id         uuid references auth.users(id) on delete cascade,
  origin_port     text not null,
  destination_port text not null,
  container_type  text,
  quantity        int default 1,
  commodity       text,
  ready_date      date,
  services        jsonb default '[]'::jsonb,
  reason          text default 'no_api_rates',
  status          text default 'pending',
  -- pending · in_progress · quoted · rejected · converted_to_booking
  assigned_to     uuid,
  admin_notes     text,
  quoted_price    numeric(12,2),
  quoted_carrier  text,
  converted_booking_id text references bookings(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_mqr_user on manual_quote_requests(user_id);
create index if not exists idx_mqr_status on manual_quote_requests(status);

alter table manual_quote_requests enable row level security;
drop policy if exists "mqr_own" on manual_quote_requests;
create policy "mqr_own" on manual_quote_requests for all using (user_id = auth.uid());
drop policy if exists "mqr_admin" on manual_quote_requests;
create policy "mqr_admin" on manual_quote_requests for all using (
  exists(select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
);

drop trigger if exists trg_mqr_updated on manual_quote_requests;
create trigger trg_mqr_updated before update on manual_quote_requests
  for each row execute function set_updated_at();
