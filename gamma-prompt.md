# Gamma AI Presentation Prompt — RoadSoS

Paste the following prompt into Gamma AI (gamma.app → New presentation → Generate with AI):

---

## PROMPT

Create a professional hackathon pitch presentation for a project called **RoadSoS** — an AI-powered road emergency response platform built for the AIEM Open Innovation Hackathon.

**Tone:** Urgent, data-driven, confident. This is a real problem with a real solution. Not a concept — a working product.

**Style:** Dark background (#0a0a0a), red accent color (#FF3B30), white text. Clean, minimal. Think Vercel / Linear design aesthetic. Use bold numbers as visual anchors.

**Slides to generate (in this exact order):**

---

### Slide 1 — Title
**RoadSoS**
*AI-Powered Road Emergency Response*
Tagline: "From crash detection to coordinated response — in under 10 seconds."
AIEM Open Innovation Hackathon

---

### Slide 2 — The Problem (make this hit hard)
Headline: **Someone dies on an Indian road every 4 minutes.**

3 statistics as large bold numbers:
- **1,50,000** deaths per year on Indian roads
- **50%** preventable with faster emergency response
- **20–30 min** average response time — the golden hour is wasted

Body: The problem isn't the crash. It's the coordination gap. Victims are unconscious. Bystanders don't know who to call. Coordinators have zero visibility. Help arrives too late.

---

### Slide 3 — Why Existing Solutions Fail
Headline: **Every current solution is either too slow or too manual.**

Table or 4-point list:
- Calling 112 → victim is unconscious or doesn't know their location
- Dashcams → record the crash, alert nobody
- Insurance apps → require manual trigger, post-incident only
- Hospital systems → siloed, no road visibility

Closing line: **None of them close the loop from detection to dispatch.**

---

### Slide 4 — Our Solution
Headline: **RoadSoS closes the loop automatically.**

Two-column layout:
Left — Mobile App (React Native):
- Detects crashes via accelerometer (g-force + jerk threshold)
- 12-second countdown — auto-fires if no cancel
- SMS to emergency contacts
- Live GPS broadcast

Right — Web Dashboard (Next.js):
- Live incident feed (real-time, sub-second)
- Tactical map with crash heatmap
- Coordinator resolves incidents, tracks responders
- Analytics: crash patterns by hour and location

---

### Slide 5 — Key Features (visual grid, 6 features)
Headline: **A complete emergency coordination platform.**

Feature cards (icon + title + one line):
1. 🚨 Auto Crash Detection — no action needed from the victim
2. 🗺️ Live Tactical Map — GPS markers + crash density heatmap
3. 📊 Crash Analytics — daily/hourly patterns, trigger ratio
4. 🏥 ICE Card QR — scan sticker → blood group instantly
5. 🆘 Web SOS — trigger alert from any browser, no app needed
6. 👨‍👩‍👧 Family Tracking — share a 6-digit code, family sees live status

---

### Slide 6 — How It Works (flow diagram)
Headline: **Impact to response in under 10 seconds.**

Linear flow with 5 steps and timing:
1. **Impact detected** — accelerometer threshold crossed (0s)
2. **12-second countdown** — driver can cancel false positive (0–12s)
3. **SOS fires** — SMS sent, incident created in cloud (<1s)
4. **Dashboard updates** — coordinator sees incident in real-time (<1s)
5. **Help dispatched** — responder assigned, GPS tracked to scene

---

### Slide 7 — Architecture
Headline: **Built on production-grade infrastructure.**

Three-layer diagram:
- **Mobile** (React Native) → accelerometer, SMS, GPS broadcast
- **Supabase** (PostgreSQL + PostGIS + Realtime) → incidents, crash logs, family links, services
- **Web Dashboard** (Next.js 15 + Vercel) → live feed, map, analytics, public pages

Key callout: Sub-second realtime updates via Supabase postgres_changes

---

### Slide 8 — Demo / Live Product
Headline: **This is live. Not a prototype.**

4 screenshots or feature callouts:
- Dashboard with live incident count
- Crash heatmap over India
- Analytics charts (daily/hourly)
- ICE card QR on incident detail page

Callout box: "12 real incidents tracked. 7 languages. Deployed on Vercel."

---

### Slide 9 — Impact & Traction
Headline: **What this means in the real world.**

3 impact statements:
- A crash victim who can't speak still gets help — automatically
- A coordinator 500km away sees the incident in under 1 second
- A first responder knows the patient's blood type before touching them

Bottom: "Every minute saved in emergency response increases survival probability by 10%."

---

### Slide 10 — What's Next
Headline: **The roadmap to full emergency coordination.**

3 phases:
- **Now** — Responder dispatch, browser push notifications, road hazard reporting
- **Next** — Predictive risk scoring, response time leaderboard, incident timeline
- **Future** — Multi-agency SaaS, live video stream, AI severity classification

---

### Slide 11 — Team & Closing
Headline: **RoadSoS**

Tagline: *"We didn't build a feature. We built the missing link in emergency response."*

Tech stack badges: React Native · Next.js 15 · Supabase · Leaflet · Vercel

GitHub: github.com/Spacey6849/RoadSOS (branch: web)

Call to action: "Try the live dashboard →"

---

**Additional instructions for Gamma:**
- Use dark theme throughout (#0a0a0a background, #FF3B30 red accents)
- Make statistics visually dominant — large font, red color
- Keep body text minimal — judges scan, they don't read
- Use icons where possible instead of bullet points
- The flow diagram on slide 6 should be horizontal with arrows
- Architecture diagram on slide 7 should be a three-tier vertical stack
