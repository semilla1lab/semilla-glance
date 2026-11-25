# Demo script (≤ 3 min) — Semilla Glance

Recorded file: `demo/semilla-glance-demo.mp4` (≈58 s, 1280×800, silent, burned-in captions).
Rebuild: `Xvfb :77 & ` → record with ffmpeg x11grab while `DISPLAY=:77 STEP_MS=2400 INTRO_MS=3000 node scripts/e2e-sim.mjs` → `python3 scripts/render_video.py`.

| t | Glasses (right) | Caption / voice-over |
|---|---|---|
| 0–5 s | Title card | "Semilla Glance: Telegram on G2. Read at a glance, reply with one tap or by voice." |
| 5–9 s | Inbox `TELEGRAM 4 new in 3 chats` | "Only the chats you allow. 'Random memes' never shows up." |
| 9–14 s | Menu → Digest | "The whole inbox in one glance." |
| 14–19 s | Launch Team: 2 messages + 3 drafts | "Tap a chat: latest messages and three AI drafts." |
| 19–22 s | Confirm `Send to Launch Team? "Approved. I'll join at 4."` | "Nothing is sent without one confirming tap." |
| 22–29 s | `SENT` → inbox `2 new in 2 chats` | "Posted as a threaded reply." |
| 29–37 s | Marta (Spanish) + Spanish drafts → scroll to *Speak a reply* | "Drafts follow the chat's language. Scroll with touchpad or R1 ring." |
| 37–42 s | `Listening…` | "G2 mic → 16 kHz PCM → our backend → Whisper-compatible STT." |
| 42–46 s | Confirm with cleaned text | "Filler words removed. One tap to send." |
| 46–50 s | Inbox | "Two replies in under a minute; phone stayed in the pocket." |
| 50–59 s | How-it-works card | Architecture, safety, and what is mocked in this recording. |

### For a stronger final cut (if time allows before Nov 29 13:59 CDMX)
1. Re-record against a **real Telegram bot** in a test group (needs a Telegram account → approval) and with a real LLM key (OpenRouter) so drafts are model-generated.
2. Add a voice-over (TTS is fine) reading the captions.
3. Upload as **YouTube unlisted** (≤ 3 min) and paste the link in DoraHacks.
