# 15-Minute Mock Live Checklist (Lot Decoder + ROFR)

## Goal
Run one end-to-end mock session and verify:
- correct lot row targeting
- guard decisioning at close
- ROFR flow actions
- captured notices/logs for post-run review

## Pre-Run (3 min)
1. Start app: `npm run dev`
2. Open hidden metrics page: `/insights/live-ledger`
3. Create/select a test session and import CSV with:
   - `title, expected, sku, quantity_expected, ebay_guard`
4. Click **Use this session for live auto-sync**
5. Confirm quantities and guard values loaded

## Live Setup (2 min)
1. Open `/live`
2. Confirm **Live lot row target** dropdown shows imported rows
3. Pick one row with guard intentionally above likely final bid

## Bidding Pass Scenario (4 min)
1. Place bids so highest bid is `>= guard`
2. Click **Stop Bid** and wait close timer
3. Expected result:
   - normal checkout flow appears
   - Lot Decoder `Actual` increases
   - `Eventual` decreases for that item

## ROFR Scenario (4 min)
1. Switch to another row with higher guard
2. Place bids so highest bid is `< guard`
3. Click **Stop Bid** and wait close timer
4. In ROFR overlay, test:
   - **Offer Next in Queue**
   - **Decline and Move Next**
   - **Accept ROFR Offer**
5. Expected result:
   - queue advances correctly
   - accept finalizes winner at guard value
   - accepted ROFR sale syncs to Lot Decoder

## Capture & Review (2 min)
1. In `/live`, review **Presenter Notices** panel
2. Confirm these notices were captured:
   - guard below threshold alert
   - ROFR declined/skipped updates
   - ROFR accepted update
3. In `/insights/live-ledger`, confirm:
   - running totals update
   - recent sync indicator updates
   - quantity sold increments and stops at expected quantity

## Pass Criteria
- Row targeting matches selected lot row
- Guard decision behaves as `bid >= guard` pass
- ROFR workflow can complete with Accept/Decline/Next
- Notices provide enough audit trail for replay
