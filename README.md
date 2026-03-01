<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/749c233c-ff26-4e21-a652-ea417bbe4f87

## Documentation Convention

For approved, user-visible behavior changes, update the relevant README section and include a `Last validated: YYYY-MM-DD` line.

## Security Quick Check (Before GitHub Push)

Use this quick routine before every push or web upload:

1. Keep real secrets only in `.env.local`.
2. Keep placeholders only in `.env.example`.
3. Run the scan command:
   `npm run scan:secrets`
   - On Windows PowerShell, if script execution is blocked, use:
     `npm.cmd run scan:secrets`
4. Push only if the scan says:
   `Secret scan passed: no high-risk patterns found in tracked files.`

If the scan fails, remove or replace the flagged secret line, then run the command again.

Last validated: `2026-03-01`

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## eBay Sold Price Guard Setup

1. Add eBay credentials in [.env.local](.env.local):
   - `EBAY_CLIENT_ID=YOUR_EBAY_CLIENT_ID`
   - `EBAY_CLIENT_SECRET=YOUR_EBAY_CLIENT_SECRET`
   - `EBAY_ENV=production`
   - `EBAY_MARKETPLACE_ID=EBAY_US`
2. Start the app server:
   `npm run dev`
3. Open the app and go to `/ebay-price-guard`.

If eBay credentials are missing, the page automatically uses dummy sold data for testing.

## Agora PKI Token Setup (Secure)

1. Add Agora credentials in [.env.local](.env.local):
   - `AGORA_APP_ID=YOUR_AGORA_APP_ID`
   - `AGORA_APP_CERTIFICATE=YOUR_AGORA_APP_CERTIFICATE`
   - `AGORA_TOKEN_TTL_SECONDS=3600`
   - `AGORA_HOST_EMAILS=host1@example.com,host2@example.com`
2. Start the app server:
   `npm run dev`
3. Generate tokens from backend only:

```bash
curl -X POST http://localhost:3000/api/agora/token \
  -H "Content-Type: application/json" \
  -d '{"channelName":"test-room","uid":1234,"role":"publisher"}'
```

Response includes `{ appId, channelName, uid, role, token, expiresAt }`.

Publisher/host token authorization:
- Host token requests (`role: "publisher"`) require `guestId` and validate the guest's email against `AGORA_HOST_EMAILS`.
- Audience token requests (`role: "subscriber"`) remain available for viewers.

Observability/logging:
- Server emits structured JSON logs for token flow (`token.request.*`, `token.issue.*`) with `scope: "agora-server"` and `requestId`.
- Client emits structured console logs for Agora lifecycle (`[agora-client]`) including join/publish/renew success and failures.

Production hardening:
- Channel policy validation enforces Agora-safe channel characters and an optional prefix via `AGORA_CHANNEL_PREFIX` (default `item-`).
- Token endpoint is rate-limited per IP with separate publisher/audience limits:
   - `AGORA_RATE_LIMIT_WINDOW_SECONDS` (default `60`)
   - `AGORA_HOST_RATE_LIMIT_PER_WINDOW` (default `20`)
   - `AGORA_AUDIENCE_RATE_LIMIT_PER_WINDOW` (default `60`)

Important security notes:
- Keep `AGORA_APP_CERTIFICATE` server-side only (never in `VITE_` variables).
- Commit only `.env.example`; keep real secrets in `.env.local`.
- If your certificate was shared publicly, rotate it in Agora Console immediately.

## Quick Start (new Vite React + Tailwind project)

1. `npm create vite@latest ebay-price-guard -- --template react-ts`
2. `cd ebay-price-guard`
3. `npm install`
4. `npm install tailwindcss @tailwindcss/vite`
5. `npm run dev`

## Supabase Phase 1 (Core Schema)

This repo includes the initial schema migration for auctions, bids, Agora session telemetry, and ad analytics:

- [supabase/migrations/20260225_000001_phase1_core_schema.sql](supabase/migrations/20260225_000001_phase1_core_schema.sql)

Apply options:

1. Supabase SQL Editor
   - Open SQL Editor in your Supabase project.
   - Paste the migration SQL and run it.

2. Supabase CLI (recommended for versioned migrations)
   - `supabase login`
   - `supabase link --project-ref <your-project-ref>`
   - `supabase db push`

Notes:
- Phase 1 is schema-first. Existing app routes still run on local SQLite until Phase 2 migration is completed.
- RLS is enabled on core tables; server-side operations should use Supabase service role keys.

## Supabase Phase 2 (API Route Migration)

Backend routes now use Supabase automatically when these are set in [.env.local](.env.local):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Fallback behavior:
- If either variable is missing, server routes continue using local SQLite (`guests.db`) for compatibility.

Migrated routes include:
- `/api/register`, `/api/guests`
- `/api/bid`, `/api/bids/:item_id`
- `/api/categories`
- `/api/auction-notices` (create, list, review)
- `/api/agora/token` host authorization guest lookup

## Lot Decoder (Hidden Metrics)

The Lot Decoder feature tracks projected lot value, sold value, and leftover eventual value for live shopping sessions.

Access control (hidden page):
- Add one of these in [.env.local](.env.local):
   - `VITE_LOT_DECODER_ACCESS_EMAILS=you@example.com`
   - `VITE_LOT_DECODER_ACCESS_USER_IDS=user_abc123`
- The page path is intentionally not linked in navigation: `/insights/live-ledger`.

CSV import format:
- Required headers: `title`, `expected`
- Optional headers: `sku`, `quantity_expected`
- Example row:
   - `Vintage Jacket,120.00,SKU-1001,1`

Lot Decoder routes:
- `GET /api/lot-decoder/sessions`
- `POST /api/lot-decoder/sessions`
- `POST /api/lot-decoder/:sessionId/activate`
- `POST /api/lot-decoder/:sessionId/import`
- `POST /api/lot-decoder/:sessionId/sales`
- `POST /api/lot-decoder/live-sale`
- `GET /api/lot-decoder/:sessionId/recent-sale`
- `GET /api/lot-decoder/:sessionId/items`
- `GET /api/lot-decoder/:sessionId/metrics`

Math used:
- `projected_total - actual_total = eventual_total`

Live auto-sync setup:
1. Open `/insights/live-ledger`.
2. Create/select a lot session.
3. Click **Use this session for live auto-sync**.
4. During `/live`, when bidding closes with a winner, the winning amount is posted to Lot Decoder automatically.
5. Lot Decoder now shows a **Last synced sale** indicator (auto-refresh every ~5 seconds) for the active live-sync session.

## Live Stream Quality Indicator

The `/live` player overlay includes a dynamic quality pill that reflects actual host camera/send resolution at runtime.

What viewers (guests) see:
- A simple quality label only: `AUTO`, `SD`, `HD`, `FHD`, or `4K`.
- No detailed stream diagnostics are exposed to guests.

What the host sees while broadcasting:
- The same quality label as viewers.
- An additional host-only metrics chip showing: `resolution · fps · kbps`.

Startup stabilization:
- The quality label uses a short anti-flicker warm-up window (`2000ms`).
- During this window, after the first non-`AUTO` label is detected, the label is temporarily held to reduce rapid bouncing.
- After warm-up, normal real-time fluctuation resumes.

LSP pause/play behavior (confirmed):
- The pause button on `/live` is functional for both host preview and audience playback.
- For Agora-rendered video, controls now pause/resume using Agora track control (not only native HTML video pause).
- For fallback MP4 playback, controls continue to use standard HTML video play/pause.

LSP default viewer image:
- The `/live` viewer now uses the WeGoneLive logo as the default poster image (`/lsp-default-logo.jpg`).
- Previous random/sample placeholder media has been removed from the default non-live viewer state.

LSP pre-live/live status pill:
- On page entry, the status pill shows `Soon` during the pre-live countdown window.
- The pill automatically switches to `LIVE` when the 5-minute countdown reaches zero.
- Countdown visibility and pill state are driven from the same timer source to keep status synchronized.

Live entry control flow:
- Home CTA (`Experience Live Shopping`) routes to `/grtw` (GetReadyToWin) instead of direct `/live` entry.
- `/live` is gated by two checks:
   1. user must be registered (local registration profile present)
   2. access window must be open (within 30 minutes of scheduled start or later)
- If either check fails, users are redirected to `/grtw`.
- During the early-access `Soon` period, users can enter `/live`, click sponsor ads, and use AI chat before the event starts.

## Shop Date Scheduling

Published shopping dates now drive site-wide promotion timing and `/live` access gating.

Pages:
- Public schedule page: `/shop-date` (`Shop Date`)
- Admin input page (restricted): `/insights/shop-date-input` (`Shop Date Input`)

Timezone and timing:
- Display and scheduling are aligned to Eastern Time (`GMT -5:00`) presentation on the schedule page.
- Live room early-access opens 30 minutes before the scheduled start.

Home page event teaser:
- The Home hero now includes a `Next Event` card powered by the same schedule/window source.
- The card shows event title, ET date/time, and a dynamic status (`Room Open` or `Opens in HH:MM:SS`).
- Quick links are included for `Shop Date` and `GetReadyToWin`.

Shop Date API routes:
- `GET /api/shop-dates` (public active/published schedule)
- `GET /api/shop-dates/window` (current access-window status for gating)
- `GET /api/shop-dates/admin` (full list for admin editor)
- `POST /api/shop-dates` (create)
- `PUT /api/shop-dates/:id` (update)
- `POST /api/shop-dates/:id/toggle-active` (activate/deactivate)

Last validated: `2026-02-28`
