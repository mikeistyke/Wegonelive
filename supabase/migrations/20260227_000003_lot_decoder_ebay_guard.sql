begin;

alter table if exists public.lot_decoder_items
  add column if not exists ebay_guard_value numeric(12, 2) not null default 0;

commit;
