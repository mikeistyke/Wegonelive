begin;

create table if not exists public.lot_decoder_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_lot_decoder_sessions_updated_at
before update on public.lot_decoder_sessions
for each row
execute function public.set_updated_at();

create table if not exists public.lot_decoder_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lot_decoder_sessions(id) on delete cascade,
  sku text,
  title text not null,
  quantity_expected integer not null default 1 check (quantity_expected > 0),
  quantity_sold integer not null default 0 check (quantity_sold >= 0),
  expected_value numeric(12, 2) not null default 0 check (expected_value >= 0),
  actual_value numeric(12, 2) not null default 0 check (actual_value >= 0),
  eventual_value numeric(12, 2) generated always as (greatest(expected_value - actual_value, 0)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lot_decoder_items_session
  on public.lot_decoder_items(session_id, created_at asc);

create trigger trg_lot_decoder_items_updated_at
before update on public.lot_decoder_items
for each row
execute function public.set_updated_at();

create table if not exists public.lot_decoder_sales (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.lot_decoder_sessions(id) on delete cascade,
  item_id uuid not null references public.lot_decoder_items(id) on delete cascade,
  sale_amount numeric(12, 2) not null check (sale_amount > 0),
  sold_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_lot_decoder_sales_session_sold_at
  on public.lot_decoder_sales(session_id, sold_at asc);

alter table public.lot_decoder_sessions enable row level security;
alter table public.lot_decoder_items enable row level security;
alter table public.lot_decoder_sales enable row level security;

commit;
