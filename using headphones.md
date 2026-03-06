# Using Headphones (First Live Event)

Device setup for your current stack:
- Camera: Logitech 1080p HD webcam
- Microphone: Blue Yeti Nano (USB)
- Host machine: Windows laptop/desktop
- Broadcast mode: RTC host in-app (`/live`)

## The Headphone Rule (Simple)
- Use wired headphones every live session.
- Plug headphones into the Blue Yeti Nano headphone jack.
- Monitor from Yeti hardware, not from software echo/monitor playback.

## Why This Rule Matters
- Prevents speaker-to-mic echo/feedback.
- Lets you catch audio problems immediately (buzz, clipping, dropouts).
- Keeps host monitoring private (viewers do not hear your system sounds).

## Exact Pre-Event Setup (5 Minutes)
1. Plug in Blue Yeti Nano via USB.
2. Plug wired headphones into Yeti Nano headphone output.
3. In Windows Sound input, select **Blue Yeti Nano** as mic.
4. In browser/app permissions, allow mic + camera.
5. In your live app, choose Yeti as audio input and Logitech as video input.
6. Keep laptop speakers muted or very low (headphones should be your monitor path).

## Important Monitoring Settings
- Keep only one monitoring path active.
- Preferred: Yeti direct monitor ON.
- Windows "Listen to this device" for Yeti: OFF.
- OBS/software mic monitoring: OFF (unless you intentionally switch and test it).

If you hear doubled/echoed voice in your headphones, you likely enabled two monitor paths.

## During the Live
- Do a 10-second mic test before starting lots.
- Watch for clipping (too loud) and room noise.
- Keep mouth-to-mic distance consistent.
- If audio glitches happen: pause talking, confirm input is still Yeti, continue.

## Fast Troubleshooting
- No sound in headphones:
  - Check headphones are plugged into Yeti (not laptop).
  - Raise Yeti headphone volume.
- Audience hears echo:
  - Mute laptop speakers.
  - Confirm software monitor/"Listen to this device" is OFF.
- Voice sounds delayed in ears:
  - Disable software monitoring and keep Yeti direct monitor only.

## First-Event Defaults (Recommended)
- Video: 720p / 30fps from Logitech 1080p camera.
- Audio input: Blue Yeti Nano.
- Audio monitoring: Headphones via Yeti direct monitor.
- Publish model: Host speaks, audience listens + chats (one-to-many).
