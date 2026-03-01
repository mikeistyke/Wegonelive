-- Phase 1: Core Supabase schema for auctions, Agora, eBay context, and analytics

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Generic updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Users/participants (maps from existing guests table in SQLite)
create table if not exists public.guests (
  id bigint generated always as identity primary key,
  name text not null,
  email citext not null unique,
  role text not null default 'viewer' check (role in ('viewer', 'host', 'admin')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_guests_updated_at
before update on public.guests
for each row
execute function public.set_updated_at();

-- Product taxonomy
create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null,
  parent_id bigint references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_categories_name_parent
  on public.categories(name, coalesce(parent_id, 0));

create trigger trg_categories_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

-- Auctions and item metadata
create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  item_id text not null unique,
  title text not null,
  description text,
  category_id bigint references public.categories(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'closed', 'cancelled')),
  starting_bid numeric(12, 2) not null default 0 check (starting_bid >= 0),
  minimum_price numeric(12, 2) check (minimum_price is null or minimum_price >= 0),
  currency_code text not null default 'USD',
  starts_at timestamptz,
  ends_at timestamptz,
  created_by_guest_id bigint references public.guests(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists idx_auctions_status_starts_at
  on public.auctions(status, starts_at);

create index if not exists idx_auctions_created_at
  on public.auctions(created_at desc);

create trigger trg_auctions_updated_at
before update on public.auctions
for each row
execute function public.set_updated_at();

-- Bids
create table if not exists public.bids (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  guest_id bigint not null references public.guests(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  bid_time timestamptz not null default now(),
  source text not null default 'web' check (source in ('web', 'mobile', 'system')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_bids_auction_amount_time
  on public.bids(auction_id, amount desc, bid_time desc);

create index if not exists idx_bids_guest_time
  on public.bids(guest_id, bid_time desc);

-- Auction notices / presenter alerts
create table if not exists public.auction_notices (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  notice_type text not null,
  message text not null,
  created_by_guest_id bigint references public.guests(id) on delete set null,
  metadata jsonb,
  reviewed_at timestamptz,
  reviewed_by_guest_id bigint references public.guests(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_auction_notices_auction_created
  on public.auction_notices(auction_id, created_at desc);

create index if not exists idx_auction_notices_unreviewed
  on public.auction_notices(auction_id)
  where reviewed_at is null;

-- Agora session telemetry (token + join context, no secrets)
create table if not exists public.agora_sessions (
  id bigint generated always as identity primary key,
  auction_id uuid references public.auctions(id) on delete set null,
  channel_name text not null,
  uid text not null,
  role text not null check (role in ('publisher', 'subscriber')),
  guest_id bigint references public.guests(id) on delete set null,
  token_expires_at timestamptz,
  joined_at timestamptz,
  left_at timestamptz,
  status text not null default 'requested' check (status in ('requested', 'joined', 'left', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agora_sessions_channel_created
  on public.agora_sessions(channel_name, created_at desc);

create index if not exists idx_agora_sessions_auction_created
  on public.agora_sessions(auction_id, created_at desc);

-- Advertising analytics events
create table if not exists public.ad_events (
  id bigint generated always as identity primary key,
  auction_id uuid references public.auctions(id) on delete set null,
  ad_id text not null,
  event_type text not null check (event_type in ('impression', 'click', 'time_on_ad', 'conversion')),
  guest_id bigint references public.guests(id) on delete set null,
  duration_ms integer,
  value numeric(12, 2),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_ad_events_auction_event_time
  on public.ad_events(auction_id, event_type, occurred_at desc);

create index if not exists idx_ad_events_adid_time
  on public.ad_events(ad_id, occurred_at desc);

-- Read-optimized analytics view for auctions
create or replace view public.auction_analytics as
select
  a.id as auction_id,
  a.item_id,
  a.title,
  a.status,
  a.starts_at,
  a.ends_at,
  count(distinct b.id) as total_bids,
  count(distinct b.guest_id) as unique_bidders,
  max(b.amount) as highest_bid,
  min(b.amount) filter (where b.amount > 0) as lowest_bid,
  count(*) filter (where ae.event_type = 'impression') as ad_impressions,
  count(*) filter (where ae.event_type = 'click') as ad_clicks,
  count(*) filter (where ae.event_type = 'conversion') as ad_conversions,
  coalesce(sum(ae.value) filter (where ae.event_type = 'conversion'), 0) as ad_revenue
from public.auctions a
left join public.bids b on b.auction_id = a.id
left join public.ad_events ae on ae.auction_id = a.id
group by a.id, a.item_id, a.title, a.status, a.starts_at, a.ends_at;

-- Baseline RLS: enabled for all core tables.
-- Service role can still operate server-side; anon has no implicit access.
alter table public.guests enable row level security;
alter table public.categories enable row level security;
alter table public.auctions enable row level security;
alter table public.bids enable row level security;
alter table public.auction_notices enable row level security;
alter table public.agora_sessions enable row level security;
alter table public.ad_events enable row level security;

-- Optional read policy for authenticated users to view live/scheduled auctions.
-- Keep write operations server-side via service role until auth integration is complete.
drop policy if exists auctions_read_authenticated on public.auctions;
create policy auctions_read_authenticated
on public.auctions
for select
to authenticated
using (status in ('scheduled', 'live', 'closed'));

commit;
