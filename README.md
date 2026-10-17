# 🏛️ RJ STREAM LIVE — Sovereign Live Streaming, Paid VIP Membership & Pay-Per-View Platform

**Engineered exclusively for Rick Jefferson | RJ Business Solutions**  
- **Live Cloudflare Production URL**: **https://rj-stream-live.rickjefferson.workers.dev**
- **Cloudflare D1 Database**: `rj-stream-live-db` (`a8b2e888-dd25-4d9e-aa72-745a421525f3`)
- **Connected Agent Runtime**: `https://rj-cloudroom-core.rickjefferson.workers.dev`

---

## 🚀 Key Capabilities

1. **Broadcaster Go-Live Studio (`/studio`)**
   - Go live directly from your browser using **Camera + Microphone (`getUserMedia`)** or **Screen Share (`getDisplayMedia`)** with real-time WebAudio dB metering, custom lower-third broadcast overlays, and Cloudflare Edge Live Frame Relay + WebRTC (`WHIP`/`WHEP`) support.
   - Compatible with **OBS Studio v31+** via WHIP WebRTC or RTMP (`rtmps://live.cloudflare.com:443/live/`) with per-channel stream keys.
   - Create unlimited new live channels on the fly and switch paywall modes dynamically (`Free Public`, `VIP Subscribers Only ($29/mo)`, or `Pay-Per-View Ticket ($49)`).

2. **Viewer Authentication & Server-Enforced Paid Tier Gating (`/watch`)**
   - Full viewer registration, login, and session persistence in Cloudflare D1 (`users`, `sessions`).
   - **3 Built-In Access Tiers**:
     - **🟢 Free Viewer (`viewer@rjbusinesssolutions.org`)**: Watches Free Public streams; receives server-enforced `HTTP 402 Payment Required` paywall overlay on VIP and Pay-Per-View channels with 1-click upgrade modal.
     - **💎 Paid VIP Subscriber (`vip@rjbusinesssolutions.org` — $29/mo)**: Unlocks all VIP-Only live broadcasts, receives VIP chat badge, and accesses the replay vault.
     - **👑 Executive Annual (`$299/yr`) / Creator Admin (`rick@rjbusinesssolutions.org`)**: Unlocks all VIP and Pay-Per-View events automatically + full Broadcaster Studio & Revenue Ledger controls.

3. **Real-Time Live Chat, Paid SuperChats & Revenue Ledger**
   - Live D1-backed stream chat with role badges (`👑 HOST`, `💎 VIP`, `MEMBER`).
   - Paid **SuperChat Tips (`$10`, `$25`, `$50`, `$100`, or custom)** that highlight in chat and immediately credit the Creator Revenue Ledger.
   - Supports Instant Card / Stripe Checkout, Official RJ Zelle (`rjbizsolution23@gmail.com`), and Wells Fargo Wire (`121000248`).

---

## 🛠️ Quick Start & Deployment

```bash
# 1. Apply D1 SQLite Schema & Seed Data
wrangler d1 execute rj-stream-live-db --remote --yes --file=schema.sql

# 2. Deploy to Cloudflare Workers
wrangler deploy
```

---

*RJ Business Solutions · 1342 NM 333, Tijeras, New Mexico 87059 · [rjbusinesssolutions.org](https://rjbusinesssolutions.org)*  
*RJ Business Solutions provides software and automation technology. Not financial or legal advice.*
