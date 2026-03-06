# RTC-Only to Hybrid RTC+RTMP Switch Checklist

Use this one-pager to decide when to keep RTC-only and when to add RTMP (OBS/production pipeline).

## Keep RTC-Only If These Are True
- Your main goal is low-latency interaction (live bids, rapid Q&A, fast call-and-response).
- You have one host and simple scene needs.
- Events are stable with your current in-app host flow.
- You are still optimizing first-event conversion and operational consistency.
- You do not yet need multi-camera scenes, heavy overlays, or external production controls.

## Move to Hybrid (RTC + RTMP) When These Are True
- You need production-grade scenes (multi-camera, transitions, lower thirds, advanced graphics).
- You want a dedicated producer/ops role in OBS while host focuses on selling.
- Your event format is repeatable and conversion metrics are stable.
- You can tolerate added end-to-end delay for viewers on RTMP outputs.
- You have a tested fallback path to RTC host if ingest fails.

## Minimum Readiness Gate (All Must Pass)
- Ingest endpoint + stream key generation is confirmed and repeatable.
- Pre-show startup checklist is documented and can be executed in under 5 minutes.
- At least 2 full rehearsals completed with no critical failures.
- Recovery runbook tested for: audio loss, video freeze, ingest drop, host reconnect.
- One active publisher policy is enforced and understood by team.

## Latency Decision Rule
- If conversion depends on instant interaction (auctions, timed offers, rapid counter-bids), keep buyer interaction loop on RTC.
- Use RTMP for production polish/distribution only after interaction reliability is proven.

## Safe Rollout Plan
1. Event 1-3: RTC-only.
2. Event 4-5: Hybrid pilot on internal/private audience.
3. Event 6+: Hybrid for public events only if pilot KPIs are equal or better than RTC-only.

## KPI Guardrails (Do Not Regress)
- Conversion rate: no material drop vs RTC-only baseline.
- Close speed per lot: stays within target window.
- Drop-off at lot transitions: not worse than baseline.
- Incident count per event: trending down, not up.

## Fallback Trigger (Immediate)
Switch back to RTC-only mid-event if any are true:
- Ingest instability lasts >60 seconds.
- Audio/video sync issues persist after one reset.
- Buyer confusion increases due to delay or instruction mismatch.

## Final Rule
- Use RTC for speed and trust.
- Add RTMP for production value only when it does not hurt conversion or reliability.
