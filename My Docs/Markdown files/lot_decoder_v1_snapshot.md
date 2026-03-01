# Lot Decoder v1 Snapshot

Date: 2026-02-28
Status: ✅ v1 Working End-to-End

## What v1 Delivers
- Hidden, access-controlled Lot Decoder page at `/insights/live-ledger`
- Session creation + CSV import workflow
- Quantity-aware ledger math
- eBay guard-aware eventual value logic
- Live row targeting from `/live` into Lot Decoder
- Guard decision at close (`bid >= guard` passes)
- ROFR workflow with queue actions:
  - Accept ROFR Offer
  - Decline and Move Next
  - Offer Next in Queue
- Recent synced-sale indicator and live polling
- Presenter notices for key guard/ROFR events

## Core v1 Rules (Implemented)
1. `expected` is treated as unit price.
2. Projected total uses `expected × quantity_expected`.
3. `ebay_guard` is pre-defined before live, invoked at decision time.
4. On close:
   - If `winning bid >= guard` → normal sale flow
   - If `winning bid < guard` → ROFR flow
5. Eventual value for unsold quantity uses guard logic.
6. Guard threshold warning (`< 75% of expected`) is soft warning only (no hard block).

## Key Files Added/Updated
- `src/components/LotDecoder.tsx`
- `src/pages/LotDecoderMetrics.tsx`
- `src/pages/LiveShopping.tsx`
- `src/components/RouteGuards.tsx`
- `src/App.tsx`
- `server.ts`
- `src/vite-env.d.ts`
- `README.md`
- `supabase/migrations/20260227_000002_lot_decoder.sql`
- `supabase/migrations/20260227_000003_lot_decoder_ebay_guard.sql`

## Test Assets and Runbooks
- `My Docs/lot_decoder_sample_10_rows.csv`
- `My Docs/lot_decoder_sample_10_rows_with_guard.csv`
- `My Docs/mock_live_15min_checklist.md`
- `My Docs/mock_live_go_no_go_signoff.md`
- `My Docs/mock_live_go_no_go_signoff_run1.md`

## Known v1 Limits (Expected)
- ROFR is workflow-driven in UI; no external payment acceptance state machine yet.
- Historical participant pool for ROFR is based on app participant/bid data available in current storage.
- Mixed Supabase/SQLite environments can work, but production should standardize on one data source.
- Guard data is spreadsheet-first; no automated eBay pricing fetch/publish pipeline yet.

## Recommended v2 Backlog
1. **ROFR transaction state model**
   - Pending / Accepted / Declined / Expired
2. **Operator control panel**
   - Close item, next item, finalize winner with explicit event log
3. **Strict-mode guard validation (optional)**
   - Env-based hard block toggle for imports
4. **Automated eBay guard ingestion**
   - Pull/refresh guard values pre-live
5. **Post-run report export**
   - Session summary (sold, eventual, ROFR outcomes, notices)

## Quick Resume Instructions
1. Start app (`npm run dev`)
2. Open `/insights/live-ledger`, select active session
3. Open `/live`, choose target row
4. Run one pass case + one ROFR case
5. Record outcome in signoff doc

---
Owner Note:
v1 is stable enough for controlled mock-live rehearsals and iterative refinement.
