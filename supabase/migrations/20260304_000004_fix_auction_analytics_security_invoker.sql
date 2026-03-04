-- Security fix: ensure auction analytics view runs with caller permissions, not creator permissions.

begin;

create or replace view public.auction_analytics
with (security_invoker = true)
as
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

commit;
