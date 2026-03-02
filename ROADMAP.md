# WeGoneLive Roadmap (GUI-First)

Last updated: 2026-03-02

## Baseline Status
- TypeScript check: pass (`npm.cmd run lint`)
- Editor diagnostics: no errors found
- Build artifact exists (`dist/index.html`)

## Phase 1 — Stabilize Core Flows (Now)
Goal: Ensure primary user journeys work end-to-end without blockers.

1. Registration and live-entry gate
   - Validate `/grtw` -> `/live` flow for registered and unregistered users.
   - Confirm redirect behavior when access window is closed.
2. ✅ Shop Date admin workflow (completed)
   - Verify create, update, and activate/deactivate in `/insights/shop-date-input`.
   - Confirm public `/shop-date` reflects active event.
3. ✅ Lot Decoder live sync (completed)
   - Validate active session selection and auto-sync from `/live` sale close event.
   - Confirm recent sale indicator updates reliably.

Exit criteria:
- ✅ No broken navigation in these flows.
- ✅ No console errors in happy path.
- ✅ README behavior descriptions still accurate.

## Phase 2 — Live Reliability and Safety
Goal: Make live experience resilient under normal issues.

1. ✅ Agora token and host authorization checks (completed)
   - Verify publisher token restrictions and audience token behavior.
2. ✅ Viewer state handling (completed)
   - Confirm pre-live `Soon` state, transition to `LIVE`, and pause/play consistency.
3. ✅ Error visibility (completed)
   - Add/verify clear UI feedback for token or network failures where missing.

Exit criteria:
- Host can recover from minor interruptions.
- Viewer status and controls remain understandable.

## Phase 3 — Data and Reporting Confidence
Goal: Ensure records and metrics are trustworthy.

1. ✅ Supabase/SQLite fallback parity (completed)
   - Validate expected behavior with and without Supabase env vars.
2. ✅ Ad reports and analytics sanity checks (completed)
   - Verify report routes and key metrics display with realistic data.
3. ✅ Lot/session import quality checks (completed)
   - Validate CSV header mismatch and bad-row handling UX.

Exit criteria:
- ✅ Core write/read paths produce expected records.
- ✅ Metrics remain consistent after refresh and route changes.

## Phase 4 — Regression Safety Net
Goal: Reduce breakage when shipping updates.

1. Add lightweight smoke checks (manual checklist first)
   - Home -> GRTW -> Live
   - Shop Date admin -> public schedule
   - Lot Decoder import -> live sale sync
2. Add minimal automated checks where practical
   - Keep `lint`, `build`, and `scan:secrets` mandatory before push.
3. Create release checklist
   - Pre-release: scan, lint, build, key route walkthrough.

Exit criteria:
- Repeatable pre-release checks are documented and used.

## Phase 5 — Stripe Payments and Payouts (Final, Fresh Before Go-Live)
Goal: Add payment capture and payout flows at the end so implementation details stay fresh for launch.

1. Decide payout model and money flow
   - Confirm platform-first collection and downstream payouts to hosts/store owners.
   - Define fee rules, payout timing, and refund/dispute responsibility.
2. Stripe setup in test mode
   - Configure Stripe keys and environment variables.
   - Set up webhook endpoint(s) and event verification.
3. Payment capture integration
   - Add checkout/payment intent flow for buyer payments.
   - Persist transaction status in app records.
4. Payout orchestration
   - Add payee onboarding and payout readiness checks.
   - Execute and track payouts with clear status fields.
5. Reconciliation and admin visibility
   - Add internal views/logging for money in, fees, payouts, and exceptions.
6. Go-live readiness for payments
   - Run end-to-end payment tests (success, fail, refund, dispute).
   - Switch from test to live keys only after checklist pass.

Exit criteria:
- A payment can be captured and traced end-to-end.
- Payouts can be initiated and reconciled.
- Refund/dispute paths are documented and tested.
- Launch checklist includes payment-specific validation.

## GUI-Only Daily Workflow
1. Make changes in VS Code.
2. Open Source Control panel.
3. Review diffs file-by-file.
4. Commit with clear message.
5. Push/Sync changes.
6. Verify on GitHub and run manual smoke checklist.

## Next Task (Start Here)
- Execute Phase 4, item 1:
   Run lightweight smoke checks (Home -> GRTW -> Live, Shop Date admin -> public schedule, Lot Decoder import -> live sale sync).
