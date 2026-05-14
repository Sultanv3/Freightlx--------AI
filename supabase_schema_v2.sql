-- ═══════════════════════════════════════════════════════════════
--   FREIGHTLX v2 Schema: Carriers + Rate Engine
--   Run AFTER supabase_schema.sql is already applied
-- ═══════════════════════════════════════════════════════════════

-- ── Extend CARRIERS with brand identity + Freightify mapping ──
alter table public.carriers add column if not exists logo_url     text;
alter table public.carriers add column if not exists brand_color  text default '#1e293b';
alter table public.carriers add column if not exists transit_days_avg int default 25;
alter table public.carriers add column if not exists services     text[] default array['FCL']::text[];
alter table public.carriers add column if not exists routes       text[] default array[]::text[];
alter table public.carriers add column if not exists freightify_code text;
alter table public.carriers add column if not exists website      text;
alter table public.carriers add column if not exists priority     int default 100;
alter table public.carriers add column if not exists description_ar text;
alter table public.carriers add column if not exists updated_at   timestamptz not null default now();

-- Seed brand identity for the 8 active carriers
update public.carriers set
  logo_url='/assets/carriers/maersk.svg',
  brand_color='#42B0D5',
  transit_days_avg=22,
  services=array['FCL','LCL','Reefer'],
  priority=1,
  website='https://www.maersk.com',
  description_ar='أكبر خط ملاحي بالعالم — دنماركي'
where code='MAEU';

update public.carriers set
  logo_url='/assets/carriers/msc.svg',
  brand_color='#F39200',
  transit_days_avg=21,
  services=array['FCL','LCL'],
  priority=2,
  website='https://www.msc.com',
  description_ar='ثاني أكبر خط — سويسري المنشأ'
where code='MSCU';

update public.carriers set
  logo_url='/assets/carriers/cosco.svg',
  brand_color='#003D7A',
  transit_days_avg=23,
  services=array['FCL','LCL','Reefer'],
  priority=3,
  website='https://www.coscoshipping.com',
  description_ar='كوسكو — الخط الصيني الرسمي'
where code='CSCO';

update public.carriers set
  logo_url='/assets/carriers/cma-cgm.svg',
  brand_color='#E40521',
  transit_days_avg=24,
  services=array['FCL','LCL'],
  priority=4,
  website='https://www.cma-cgm.com',
  description_ar='سي ام ايه سي جي ام — فرنسي'
where code='CMDU';

update public.carriers set
  logo_url='/assets/carriers/hapag-lloyd.svg',
  brand_color='#FF6900',
  transit_days_avg=22,
  services=array['FCL','LCL','Reefer'],
  priority=5,
  website='https://www.hapag-lloyd.com',
  description_ar='هاباغ لويد — الخط الألماني الكلاسيكي'
where code='HLCU';

update public.carriers set
  logo_url='/assets/carriers/one.svg',
  brand_color='#FF1493',
  transit_days_avg=23,
  services=array['FCL','LCL'],
  priority=6,
  website='https://www.one-line.com',
  description_ar='ONE — تحالف ياباني (NYK + MOL + K-Line)'
where code='ONEY';

update public.carriers set
  logo_url='/assets/carriers/hmm.svg',
  brand_color='#0F4C81',
  transit_days_avg=24,
  services=array['FCL','LCL'],
  priority=7,
  website='https://www.hmm21.com',
  description_ar='HMM — كوري جنوبي'
where code='HDMU';

update public.carriers set
  logo_url='/assets/carriers/arkas.svg',
  brand_color='#003F87',
  transit_days_avg=26,
  services=array['FCL','LCL'],
  priority=8,
  website='https://www.arkasline.com.tr',
  description_ar='أركاس لاين — تركي'
where code='ARKU';

-- ── RATE REQUESTS (audit log of every rate search) ──
create table if not exists public.rate_requests (
  id              text primary key,
  user_id         uuid references auth.users(id) on delete set null,
  origin_port     text not null,
  destination_port text not null,
  container_type  text not null default '40HC',
  cargo_type      text not null default 'FCL' check (cargo_type in ('FCL','LCL','Reefer','OOG','Bulk','Air')),
  commodity_code  text,
  commodity_name  text,
  cargo_weight_kg numeric,
  cargo_volume_m3 numeric,
  cargo_ready_date date,
  incoterms       text check (incoterms in ('EXW','FCA','FOB','CFR','CIF','DAP','DDP','DPU') or incoterms is null),
  num_containers  int not null default 1,
  hazardous       boolean not null default false,
  source          text not null default 'freightify',
  offers_count    int not null default 0,
  error           text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);
create index if not exists rate_req_user_idx on public.rate_requests (user_id, created_at desc);
create index if not exists rate_req_route_idx on public.rate_requests (origin_port, destination_port);

-- ── RATE OFFERS (the actual rates returned per request) ──
create table if not exists public.rate_offers (
  id              text primary key,
  request_id      text not null references public.rate_requests(id) on delete cascade,
  carrier_code    text references public.carriers(code),
  carrier_name    text not null,
  vessel          text,
  route           text,
  transit_days    int,
  price           numeric(12,2) not null,
  currency        text not null default 'USD',
  validity_until  date,
  etd             date,
  eta             date,
  service_type    text,
  free_days       int default 10,
  is_direct       boolean default true,
  raw             jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists rate_offers_req_idx on public.rate_offers (request_id);
create index if not exists rate_offers_carrier_idx on public.rate_offers (carrier_code);

-- ── RLS ──
alter table public.rate_requests enable row level security;
alter table public.rate_offers   enable row level security;

drop policy if exists "rate_requests_owner" on public.rate_requests;
drop policy if exists "rate_offers_via_request" on public.rate_offers;
drop policy if exists "carriers_public_read" on public.carriers;

create policy "rate_requests_owner" on public.rate_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "rate_offers_via_request" on public.rate_offers
  for select using (exists (select 1 from public.rate_requests r
                            where r.id = rate_offers.request_id and r.user_id = auth.uid()));

-- Carriers list is public (everyone can read)
alter table public.carriers enable row level security;
create policy "carriers_public_read" on public.carriers
  for select using (true);

-- Admin can manage carriers
drop policy if exists "carriers_admin_write" on public.carriers;
create policy "carriers_admin_write" on public.carriers
  for all using (exists (select 1 from public.profiles
                         where id = auth.uid() and role in ('admin','super_admin')))
        with check (exists (select 1 from public.profiles
                            where id = auth.uid() and role in ('admin','super_admin')));

-- ── carriers.updated_at trigger ──
drop trigger if exists carriers_updated on public.carriers;
create trigger carriers_updated before update on public.carriers
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════
--   DONE — Verify
--   select code, name, brand_color, priority, services from carriers order by priority;
-- ═══════════════════════════════════════════════════════════════
