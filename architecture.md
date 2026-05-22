# RoadSoS — Architecture & Vision

---

## 1. The Problem

Road accidents are the **leading cause of death for people aged 5–29** globally. In India alone:

- **1.5 lakh people die every year** on roads — one death every 4 minutes
- **50% of deaths are preventable** if emergency response arrives within the golden hour
- The average emergency response time in India is **20–30 minutes** — in rural areas, often never
- **70% of crash victims receive no first aid** before reaching a hospital
- Only **1 in 10 accident scenes** is reported to emergency services within the first 5 minutes

The core problem is not the crash — it's the **coordination gap** between the moment of impact and the moment help arrives.

---

## 2. Why Existing Solutions Fall Short

| Solution | What's Missing |
|----------|---------------|
| **Calling 112** | Victim is unconscious, in shock, or doesn't know their location |
| **Bystander help** | No one knows who to call, nearest hospital, or patient's blood type |
| **Dashcam / telematics** | Records the crash but doesn't alert anyone or dispatch help |
| **Insurance apps** | Require manual trigger, post-incident reporting only, no real-time coordination |
| **Hospital systems** | Siloed — no visibility into what's happening on the road before arrival |

**The gap:** Every existing tool is either reactive (records after the fact) or manual (requires the victim to act). None of them close the loop from **detection → alert → dispatch → arrival**.

---

## 3. Our Solution — RoadSoS

RoadSoS is a **full-stack emergency response platform** that automates the entire chain from crash detection to coordinated response.

### How It Works

```
Driver's phone (idle in pocket)
    │
    ▼  accelerometer detects impact (g-force + jerk threshold)
    │
    ▼  12-second countdown shown on screen
    │
    ├─ Driver cancels → logged as false positive in crash_logs
    │
    └─ No cancel → SOS fires automatically
           │
           ├── SMS sent to emergency contacts
           ├── Incident created in Supabase (real-time)
           ├── GPS broadcast begins
           └── Web dashboard updates instantly
                    │
                    ▼
           Coordinator sees incident, dispatches help,
           tracks responder on live map, resolves incident
```

### Key Features

| Feature | Impact |
|---------|--------|
| **Auto crash detection** | No action needed from victim |
| **Live incident dashboard** | Coordinator sees crashes the moment they happen |
| **GPS heatmap** | Identifies dangerous road stretches before more crashes happen |
| **ICE Card QR** | First responder scans sticker → sees blood group instantly |
| **Web SOS** | Anyone with a browser can trigger an alert — no app needed |
| **Family tracking** | Family sees Safe/Active status in real-time via 6-digit code |
| **Crash severity inspector** | G-force data lets coordinators tune detection and reduce false positives |
| **7 languages** | Works across India's linguistic diversity |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MOBILE APP                           │
│                    (React Native)                           │
│                                                             │
│  Accelerometer → Crash Detection Algorithm                  │
│  (g-force threshold + jerk rate + sensitivity setting)      │
│                                                             │
│  On SOS fire:                                               │
│  ├── SMS via device (emergency contacts)                    │
│  ├── INSERT into incidents table                            │
│  ├── INSERT into crash_logs table                           │
│  └── Broadcast GPS via Supabase Realtime channel            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      SUPABASE                               │
│              (PostgreSQL + PostGIS + Realtime)              │
│                                                             │
│  Tables:                                                    │
│  ├── incidents      (id, user, location, status, ...)       │
│  ├── crash_logs     (g_force, jerk_gs, outcome, ...)        │
│  ├── services       (hospitals, ambulances, police, ...)    │
│  ├── profiles       (blood_group, medical_info, ...)        │
│  ├── family_links   (6-digit code → user_id)                │
│  └── user_contacts  (emergency contacts)                    │
│                                                             │
│  Realtime channels:                                         │
│  ├── incidents-web       (postgres_changes INSERT)          │
│  └── responder-locations (broadcast GPS updates)            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    WEB DASHBOARD                            │
│                   (Next.js 15 + Vercel)                     │
│                                                             │
│  /dashboard        Live incident feed + tactical map        │
│  /analytics        Crash pattern charts (daily/hourly)      │
│  /admin/crash-logs G-force severity inspector               │
│  /track/[id]       Incident detail + resolve + ICE QR       │
│  /sos              Public emergency trigger (no app)        │
│  /ice/[id]         Public medical card (no auth)            │
│  /track/family/[code]  Family live status portal            │
│                                                             │
│  Map: Leaflet + CartoDB + leaflet.heat                      │
│  Charts: Recharts (line / bar / donut)                      │
│  Auth: Supabase Auth                                        │
│  Deploy: Vercel Edge                                        │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow — New Incident

```
Impact detected (mobile)
    → INSERT incidents (Supabase)
    → postgres_changes fires
    → Web dashboard receives event (<1 second)
    → Incident appears in feed
    → Accent line flashes red
    → Active count increments
    → Map marker appears (if GPS available)
    → Coordinator clicks → resolves → status updates
```

### Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Mobile | React Native | Cross-platform, accelerometer access |
| Backend | Supabase (PostgreSQL + PostGIS) | Realtime, Auth, spatial queries, zero infra |
| Web framework | Next.js 15 App Router | Server components, API routes, i18n |
| Map | Leaflet + react-leaflet | Lightweight, offline-capable |
| Heatmap | leaflet.heat | Crash density visualisation |
| Charts | Recharts | React-native, no canvas issues |
| Deployment | Vercel | Edge-optimised, auto-deploy from GitHub |

---

## 5. Future Upgrades

### Near-term (next sprint)
- **Responder dispatch** — coordinators assign responders to incidents from the web; responders get push notification with incident location
- **Browser push notifications** — alert coordinators even when the tab is closed
- **Road hazard crowdsourcing** — public `/report` page for potholes, flooding, debris

### Medium-term
- **Predictive risk scoring** — use `crash_logs` history to flag high-risk road segments by hour of day; no ML needed, pure count-based aggregation
- **Response time leaderboard** — measure median time from detection to responder arrival; motivates responders, gives coordinators performance data
- **Incident timeline** — forensic view of every event from impact to resolution (g-force reading → SOS sent → responder dispatched → arrived → resolved)

### Long-term
- **Multi-agency SaaS** — each city/agency gets their own workspace with RLS-scoped data
- **Live video stream** — WebRTC feed from driver's camera to coordinator during active incident
- **AI severity prediction** — classify crash severity from g-force + jerk data to auto-prioritise dispatch
- **Offline map tiles** — pre-cache major city tiles so the dashboard works on poor connectivity
