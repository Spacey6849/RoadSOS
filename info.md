# RoadSoS Web — Complete Project Info

> Stack: Next.js 15, Supabase, Leaflet, Framer Motion  
> Supabase project: `abmsxyjyapyzkrskakgz.supabase.co`  
> Repo: https://github.com/Spacey6849/RoadSOS.git (branch: `web`)  
> Deployed: Vercel

---

## Session History

### Session 1 (2026-05-22) — Full redesign + 7 new features

**UI Redesign (all pages)**
- Dark/light mode toggle (top-right nav, warm off-white light theme `#f0ede8`)
- All colors converted to CSS custom properties (`--bg`, `--surface`, `--text-primary`, etc.)
- Dashboard: 72px hero active count, red left-edge accent with flash on new incident, row left-borders replace AUTO/MANUAL badges, ACTIVE badge removed (silence = active), scanline overlay on map, geolocation
- Track page: dramatic status banner with pulsing dot + SOS/OK watermark, fixed lat/lng swap
- Admin page: 56px hero numbers, consolidated status list
- Services page: left-border type system, 24×7 badge

**Bug Fixes**
- Runtime TypeError `cannot read properties of undefined (reading 'unsubscribe')` — channels moved to `useRef`
- `postgres_changes after subscribe()` error — fixed channel chaining order
- Filter button border conflict (React inline style warning) — replaced shorthand with longhand
- `appendChild` crash on TileLayer — imported `leaflet/dist/leaflet.css` directly in component
- Lat/lng swap on track page map — was `[lng, lat]`, now `[lat, lng]`
- Map not flying to user location — added `FlyToCenter` component using `useMap()` inside `MapContainer`

**New Features**
1. Accident Hotspot Heatmap — `leaflet.heat`, toggle on dashboard map
2. Crash Analytics Charts — `/analytics`, recharts (line/bar/donut)
3. Crash Severity Inspector — `/admin/crash-logs`, reads `crash_logs` table
4. Incident Resolve/Re-open — resolve button on `/track/[id]`, `resolution_note` column added
5. Web SOS — `/sos` public page + `/api/sos` server-side route, rate-limited
6. ICE Card QR — `qrcode.react` on track page, public `/ice/[id]` page
7. Family Tracking — `family_links` table, `/track/family/[code]` page

---

## All Pages

| Route | Auth | Description |
|-------|------|-------------|
| `/[locale]/dashboard` | Yes | Live feed + map + stats |
| `/[locale]/analytics` | Yes | Charts: daily / hourly / trigger ratio |
| `/[locale]/track/[id]` | Yes | Incident detail + resolve + QR |
| `/[locale]/admin` | Yes | System overview |
| `/[locale]/admin/services` | Yes | Emergency service CRUD |
| `/[locale]/admin/crash-logs` | Yes | Crash severity table |
| `/[locale]/login` | No | Sign in |
| `/[locale]/signup` | No | Create account |
| `/[locale]/sos` | No | Public web SOS form |
| `/ice/[id]` | No | Public ICE card |
| `/[locale]/track/family/[code]` | No | Family tracking portal |

---

## Supabase Tables

### `incidents`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_name` | text | |
| `blood_group` | text | |
| `trigger_type` | text | `'auto'` or `'manual'` |
| `location` | geometry (PostGIS) | `POINT(lng lat)` |
| `address` | text | |
| `country_code` | char | |
| `status` | text | `'active'` or `'resolved'` |
| `sms_status` | jsonb | |
| `created_at` | timestamptz | |
| `resolved_at` | timestamptz | Set on resolve |
| `resolution_note` | text | **Added this session** |

### `crash_logs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `detected_at` | timestamptz | |
| `device_platform` | text | |
| `mode` | text | Detection mode |
| `sensitivity` | text | low/medium/high |
| `g_force` | float8 | Peak G-force |
| `jerk_gs` | float8 | Jerk in g/s |
| `latitude` | float8 | Note: NOT `lat` |
| `longitude` | float8 | Note: NOT `lng` |
| `address` | text | |
| `outcome` | text | `sos_sent`/`cancelled`/pending |
| `created_at` | timestamptz | |
| `resolved` | boolean | Default `false`; set true from dashboard map |
| `resolved_at` | timestamptz | Set when a responder resolves the crash |

### `profiles`
| Column | Type |
|--------|------|
| `id` | uuid (FK → auth.users) |
| `name` | text |
| `blood_group` | text |
| `language` | text |
| `medical_info` | jsonb |
| `crash_detection_enabled` | boolean |
| `crash_sensitivity` | text |
| `created_at` / `updated_at` | timestamptz |

### `services`
| Column | Type |
|--------|------|
| `id` | uuid |
| `name`, `service_type` | text |
| `address`, `city`, `state` | text |
| `country_code` | char |
| `location` | geometry (PostGIS) |
| `primary_phone` | text |
| `alt_phones` | jsonb |
| `is_24x7` | boolean |
| `tags` | jsonb |
| `verified_at`, `created_at` | timestamptz |

### `user_contacts`
| Column | Type |
|--------|------|
| `id` | uuid |
| `user_id` | uuid |
| `name`, `phone` | text |
| `created_at` | timestamptz |

### `family_links` — **Added this session**
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `code` | varchar(6) | Unique 6-digit code |
| `user_id` | uuid | FK → auth.users |
| `expires_at` | timestamptz | Default: 7 days |
| `created_at` | timestamptz | |

RLS: public SELECT enabled (anyone can read by code).

---

## Key Files

```
app/
├── [locale]/
│   ├── layout.tsx              — Nav + ThemeProvider + LanguageProvider + theme toggle
│   ├── dashboard/page.tsx      — Live feed, map, heatmap, geolocation
│   ├── analytics/page.tsx      — 3 recharts charts (NEW)
│   ├── track/
│   │   ├── [incidentId]/page.tsx — Resolve button, QR code, PostGIS parsing
│   │   └── family/[code]/page.tsx — Family tracking (NEW)
│   ├── admin/
│   │   ├── page.tsx            — System overview, 3-col management grid
│   │   ├── services/page.tsx   — CRUD with left-border type system
│   │   └── crash-logs/page.tsx — Crash severity inspector (NEW)
│   ├── sos/page.tsx            — Public web SOS (NEW)
│   ├── login/page.tsx
│   └── signup/page.tsx
├── ice/[id]/page.tsx           — Public ICE card server component (NEW)
├── api/sos/route.ts            — Server-side SOS insert, rate-limited (NEW)
components/
└── ResponderMap.tsx            — Leaflet map: theme tiles, heatmap, FlyToCenter, markers
lib/
├── ThemeProvider.tsx           — Dark/light context, localStorage persistence
├── leaflet-heat.d.ts           — TypeScript declaration for leaflet.heat (NEW)
├── types.ts
├── supabase/
└── i18n/
```

---

## Theme System

CSS custom properties on `[data-theme]` attribute of `<html>`:

| Variable | Dark | Light |
|----------|------|-------|
| `--bg` | `#0a0a0a` | `#f0ede8` |
| `--surface` | `#111111` | `#e8e4de` |
| `--bg-elevated` | `#111111` | `#e8e4de` |
| `--bg-hover` | `#161616` | `#dedad3` |
| `--border` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.08)` |
| `--border-mid` | `rgba(255,255,255,0.10)` | `rgba(0,0,0,0.14)` |
| `--text-primary` | `#f2f2f7` | `#1a1a1a` |
| `--text-muted` | `#71717A` | `#6b6b6b` |
| `--text-faint` | `#3f3f46` | `#a0a0a0` |
| `--red` | `#FF3B30` | `#d93025` |
| `--blue` | `#0A84FF` | `#1a73e8` |
| `--green` | `#34C759` | `#1e8e3e` |
| `--amber` | `#FF9F0A` | `#e37400` |
| `--purple` | `#BF5AF2` | `#9334e6` |

---

## Map Architecture

- **Tile layer:** CartoDB Dark Matter (dark) / CartoDB Light (light) — switches via `MutationObserver` on `data-theme`
- **User location:** Blue `L.divIcon` dot, always shown
- **Incident markers:** Red `L.divIcon` dots, toggled by Landmarks button
- **Responder markers:** Purple SVG pin, toggled by Landmarks button
- **Heatmap:** `leaflet.heat` layer, toggled by Heatmap button, lazy-fetched on first toggle
- **FlyToCenter:** Component inside `MapContainer` using `useMap()` — watches `center` prop and calls `map.flyTo()`. Necessary because `MapContainer.center` is read-only after mount.
- **PostGIS parsing:** `raw.location.coordinates` returns `[lng, lat]` — swapped to `[lat, lng]` in `mapIncident()`

---

## Realtime Channels

| Channel | Type | Purpose |
|---------|------|---------|
| `incidents-web` | postgres_changes INSERT | New incident → feed + accent flash |
| `responder-locations-web` | broadcast location-update | Responder position updates |
| `track-[id]` | broadcast location-update | Per-incident responder tracking |
| `family-[code]` | postgres_changes * | Family tracking live updates |

---

## npm Dependencies

### Existing
- `next@^15.2.0`, `react@^19.1.0`
- `@supabase/supabase-js@^2.49.0`, `@supabase/ssr@^0.6.0`
- `leaflet@^1.9.4`, `react-leaflet@^5.0.0`
- `framer-motion@^11.18.0`
- `lucide-react@^0.475.0`
- `tailwindcss@^4.1.0`

### Added this session
- `recharts@2.12.7` — analytics charts
- `leaflet.heat@0.2.0` — heatmap layer
- `qrcode.react@4.1.0` — ICE card QR code

---

## Environment Variables

```env
# .env.local (gitignored — never commit)
NEXT_PUBLIC_SUPABASE_URL=https://abmsxyjyapyzkrskakgz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_DEFAULT_LANG=en
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # server-side only, /api/sos route
```

All four must be added to Vercel Environment Variables.

---

## Security Notes

- `.env.local` is gitignored — no secrets in the repo
- `SUPABASE_SERVICE_ROLE_KEY` is only used in `/api/sos/route.ts` (server-side Next.js route handler) — never in client bundle
- Web SOS rate-limited: max 3 inserts per IP per hour (checked via Supabase query)
- ICE card token = incident UUID (hard to guess, no separate token table needed)
- Family tracking: RLS allows public SELECT on `family_links` — only `code` lookup, no user data exposed

---

## Hackathon Demo Flow

1. `/dashboard` — live incident count, map centered on your location, red dots on incidents
2. Toggle Heatmap — crash density overlay appears
3. `/analytics` — daily/hourly charts, trigger ratio donut
4. `/admin/crash-logs` — g-force table, color-coded by outcome
5. `/track/[id]` — resolve an incident with a note, scan QR for ICE card
6. `/sos` — trigger a web SOS from browser (no app needed)
7. `/track/family/[code]` — family member sees live Safe/Active status

---

## Feature Status vs Plan

| # | Feature | Status |
|---|---------|--------|
| 1 | Accident hotspot heatmap | ✅ Done |
| 2 | Crash analytics charts | ✅ Done |
| 3 | Crash severity inspector | ✅ Done |
| 4 | Browser push notifications | ⏳ Planned |
| 5 | Incident status management | ✅ Done |
| 6 | Response time leaderboard | ⏳ Planned |
| 7 | Web SOS (no app) | ✅ Done |
| 8 | Family tracking portal | ✅ Done |
| 9 | Road hazard crowdsourcing | ⏳ Planned |
| 10 | Responder dispatch | ⏳ Planned |
| 11 | ICE card QR generator | ✅ Done |
| 12 | Incident timeline | ⏳ Planned |
| 13 | Service coverage gap map | ⏳ Planned |
| 14–20 | P3 features | ⏳ Future |
