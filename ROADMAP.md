# WeGoneLive Roadmap (GUI-First)

Last updated: 2026-03-02

## Baseline Status
- TypeScript check: pass (`npm.cmd run lint`)
- Editor diagnostics: no errors found
- Build artifact exists (`dist/index.html`)

## Priority Legend
- **[P0] Must-fix before first live test**
- **[P1] High-impact next**
- **[P2] Nice-to-have later**

## New Concept Intake Rule
When a new concept is proposed, assign `P0/P1/P2` before design/build.
- If it blocks trust, revenue, or live-test readiness -> `P0`
- If it materially improves customer outcome but does not block live test -> `P1`
- If it is polish/non-blocking -> `P2` and defer

Execution guardrail:
- No `P2` implementation while any active `P0` is open.

## Phase 1 [P0] — Stabilize Core Flows (Now)
Goal: Ensure primary user journeys work end-to-end without blockers.
Focus rule: Close all `[P0]` items in this phase before any cross-phase work.

1. ✅ [P0] Registration and live-entry gate
   - Validate `/grtw` -> `/live` flow for registered and unregistered users.
   - Confirm redirect behavior when access window is closed.
2. ✅ [P0] Shop Date admin workflow (completed)
   - Verify create, update, and activate/deactivate in `/insights/shop-date-input`.
   - Confirm public `/shop-date` reflects active event.
3. ✅ [P0] Lot Decoder live sync (completed)
   - Validate active session selection and auto-sync from `/live` sale close event.
   - Confirm recent sale indicator updates reliably.

Exit criteria:
- ✅ No broken navigation in these flows.
- ✅ No console errors in happy path.
- ✅ README behavior descriptions still accurate.

## Phase 2 [P0/P1] — Live Reliability and Safety
Goal: Make live experience resilient under normal issues.
Focus rule: Complete `[P0]` reliability checks first, then finalize `[P1]` UX/error clarity.

1. ✅ [P0] Agora token and host authorization checks (completed)
   - Verify publisher token restrictions and audience token behavior.
2. ✅ [P0] Viewer state handling (completed)
   - Confirm pre-live `Soon` state, transition to `LIVE`, and pause/play consistency.
3. ✅ [P1] Error visibility (completed)
   - Add/verify clear UI feedback for token or network failures where missing.

Exit criteria:
- Host can recover from minor interruptions.
- Viewer status and controls remain understandable.

## Phase 3 [P0/P1] — Data and Reporting Confidence
Goal: Ensure records and metrics are trustworthy.
Focus rule: Lock `[P0]` data integrity first, then complete `[P1]` reporting/import quality.

1. ✅ [P0] Supabase/SQLite fallback parity (completed)
   - Validate expected behavior with and without Supabase env vars.
2. ✅ [P1] Ad reports and analytics sanity checks (completed)
   - Verify report routes and key metrics display with realistic data.
3. ✅ [P1] Lot/session import quality checks (completed)
   - Validate CSV header mismatch and bad-row handling UX.

Exit criteria:
- ✅ Core write/read paths produce expected records.
- ✅ Metrics remain consistent after refresh and route changes.

## Phase 4 [P0/P1] — Regression Safety Net
Goal: Reduce breakage when shipping updates.
Focus rule: Run `[P0]` smoke checks before adding `[P1]` automation and release process polish.

1. [P0] Add lightweight smoke checks (manual checklist first)
   - Home -> GRTW -> Live
   - Shop Date admin -> public schedule
   - Lot Decoder import -> live sale sync
   - Mobile responsiveness sanity check (navbar + Live Shopping layout on small screens)
2. [P1] Add minimal automated checks where practical
   - Keep `lint`, `build`, and `scan:secrets` mandatory before push.
3. [P1] Create release checklist
   - Pre-release: scan, lint, build, key route walkthrough.

Exit criteria:
- Repeatable pre-release checks are documented and used.

## Phase 5 [P0/P1] — Stripe Payments and Payouts (Final, Fresh Before Go-Live)
Goal: Add payment capture and payout flows at the end so implementation details stay fresh for launch.
Focus rule: Ship payment-path `[P0]` readiness end-to-end before `[P1]` reconciliation enhancements.

1. [P0] Decide payout model and money flow
   - Confirm platform-first collection and downstream payouts to hosts/store owners.
   - Define fee rules, payout timing, and refund/dispute responsibility.
2. [P0] Stripe setup in test mode
   - Configure Stripe keys and environment variables.
   - Set up webhook endpoint(s) and event verification.
3. [P0] Payment capture integration
   - Add checkout/payment intent flow for buyer payments.
   - Persist transaction status in app records.
4. [P0] Payout orchestration
   - Add payee onboarding and payout readiness checks.
   - Execute and track payouts with clear status fields.
5. [P1] Reconciliation and admin visibility
   - Add internal views/logging for money in, fees, payouts, and exceptions.
6. [P0] Go-live readiness for payments
   - Run end-to-end payment tests (success, fail, refund, dispute).
   - Switch from test to live keys only after checklist pass.

Exit criteria:
- A payment can be captured and traced end-to-end.
- Payouts can be initiated and reconciled.
- Refund/dispute paths are documented and tested.
- Launch checklist includes payment-specific validation.

## Cross-Phase Operating Shell (Draft)
Name: **HammerFlow Loop**

Use this shell across planning, implementation, QA, and go-live prep. Detailed SOP/checklists can be expanded later.

1. Pre-Auction
   - eBay sold comps research
   - Reserve price setup
   - Supabase CSV upload
   - Agora stream test
   - Auction date/time confirmation
   - Bidder registration page check
2. Live Auction
   - Real-time bid refresh behavior check
   - eBay Guard below-reserve trigger check
   - Presenter controls check (`start/stop lot`, `override reserve`)
3. Post-Auction
   - Sold/unsold status completion
   - Right-of-first-refusal flow check
   - Winner invoice confirmation
   - Analytics/KPI update verification

## GUI-Only Daily Workflow
1. Make changes in VS Code.
2. Open Source Control panel.
3. Review diffs file-by-file.
4. Commit with clear message.
5. Push/Sync changes.
6. Verify on GitHub and run manual smoke checklist.

## Next Task (Start Here)
- Execute Phase 4, item 1 [P0]:
   Run lightweight smoke checks (Home -> GRTW -> Live, Shop Date admin -> public schedule, Lot Decoder import -> live sale sync).

## Today Queue (Priority Intake Snapshot)
- **P0 Now**
   - Complete Phase 4.1 lightweight smoke checks end-to-end.
   - Confirm no regressions in `/lsp` ATE flow (canned match, no-match escalation, Raise Hand CTA, host badge count).
- **P1 Next**
   - Add a focused Presenter Notices filter for ATE escalations only (host quality-of-life).
   - Add one short release-note entry for ATE customer-facing behavior and privacy guardrail updates.
- **P2 Later**
   - Chat UI polish only (microcopy refinements, spacing tweaks, optional icon polish).
   - Additional ATE expansion beyond current 24 canned Q&A entries.
