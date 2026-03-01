# Mock Live Go / No-Go Signoff (Run #1)

Date: 2026-02-27
Session Name: second session test
Operator: Mike
Observer: ____________________

## Scope
This signoff validates end-to-end mock-live readiness for:
- Lot Decoder session import and activation
- Live row targeting
- Guard decision logic
- ROFR flow actions
- Metrics/notices capture

## Pre-Checks (must pass)
- [ ] App starts and loads `/insights/live-ledger`
- [ ] CSV import succeeds for selected session
- [ ] Session activated for live auto-sync
- [ ] `/live` shows lot row target dropdown with rows
- [ ] Start Broadcast works without Agora channel error

## Core Flow Validation
### A) Pass Case (`bid >= guard`)
- [ ] Highest bid meets/exceeds guard
- [ ] Normal checkout flow appears
- [ ] Lot Decoder `Actual` increases
- [ ] Lot Decoder `Eventual` adjusts correctly
- [ ] Recent synced-sale indicator updates

### B) ROFR Case (`bid < guard`)
- [ ] Guard/ROFR message appears
- [ ] ROFR queue shows with correct first candidate
- [ ] `Offer Next in Queue` advances queue
- [ ] `Decline and Move Next` records decision and advances
- [ ] `Accept ROFR Offer` finalizes at guard value
- [ ] Accepted ROFR syncs into Lot Decoder totals

## Data Integrity Checks
- [ ] Quantity sold does not exceed quantity expected
- [ ] Sold-out rows block additional adds
- [ ] Eventual uses guard value for unsold quantity
- [ ] Import soft warnings appear for guard < 75% expected
- [ ] Presenter notices contain guard/ROFR events

## Defects / Observations
1) __________________________________________________________
2) __________________________________________________________
3) __________________________________________________________

## Final Decision
- [ ] GO (ready for broader pilot)
- [ ] NO-GO (fixes required)

Decision Notes:
____________________________________________________________
____________________________________________________________

## Required Fixes Before GO (if any)
- [ ] Fix 1: _________________________________________________
- [ ] Fix 2: _________________________________________________
- [ ] Fix 3: _________________________________________________

## Signatures
Operator: ____________________  Date: ____________________
Observer: ____________________  Date: ____________________
