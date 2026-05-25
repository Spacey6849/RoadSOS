# RoadSoS Responder

A tiny Expo / React Native app for emergency responders (ambulance / police / fire). When the responder taps **Go on duty**, the app streams their live GPS position over Supabase Realtime to the **RoadSoS dispatch dashboard** at [`web-app/`](../web-app/). The dashboard plots them as an indigo pin so coordinators can route the nearest responder to an incoming crash.

This is the third piece of the system, alongside:
- [`expo-app/`](../expo-app/) — the driver/pedestrian app that detects the crash and sends the SOS.
- [`web-app/`](../web-app/) — the responder dashboard that displays incidents + crash logs + responders on a map.

## What it does

- **Identity** — enter a name (e.g. *"Unit 7 — Ravi"*) and pick a type (Ambulance / Police / Fire). Persisted in `AsyncStorage` so the next session keeps the same `responderId` and shows up as the same dot on the dashboard.
- **GPS streaming** — `expo-location.watchPositionAsync` fires whenever you move >10 m or every ~5 s.
- **Realtime broadcast** — every position update is sent on the `responder-locations-web` Supabase Realtime channel (event `location-update`) with payload `{ responderId, name, lat, lng, responderType }`. A heartbeat re-broadcasts every 8 s even if the responder is stationary so the dashboard knows they're still on duty.
- **Off duty** stops the watcher, removes the channel, and clears the screen. No background tracking — by design, the radio only streams when the responder explicitly went on duty.

## Stack
- Expo SDK 54 / React Native 0.81 / TypeScript
- Expo Router (file-based, one screen at `app/index.tsx`)
- `expo-location`
- `@supabase/supabase-js` for the Realtime channel
- `@react-native-async-storage/async-storage` for persisting identity

## Setup
```bash
cd Responder-app
npm install
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
#   — same Supabase project as expo-app and web-app
npm start
```
Press `a` for an Android emulator, `i` for iOS simulator, or scan the QR code in **Expo Go** on a physical phone — no custom dev build needed, the only native module used (`expo-location`) is bundled in Expo Go.

For a release APK build, run `npx expo prebuild` then `cd android && ./gradlew assembleRelease`.

## Verifying it works
1. Start the dashboard locally (`cd ../web-app && npm run dev`) or open the deployed one at https://road-sos-sepia.vercel.app/en/dashboard.
2. Run this app, enter a name, pick a type, tap **Go on duty**.
3. Within ~5 s, an indigo pin should appear on the dashboard map at your current GPS position, and the **RESPONDERS** stat card increments.
4. Walk a few metres — the dot moves on the map within ~5 s of each position update.

If the dot doesn't appear:
- Confirm the dashboard's `RESPONDERS` count incremented — if yes, the broadcast arrived but the marker icon isn't rendering. Open the browser console for errors.
- Confirm both apps point to the **same** Supabase project (URL + anon key in `.env`).
- Check the in-app "broadcasts sent" counter — if it stays at 0, the channel never subscribed (network / Supabase URL issue).

## Broadcast contract

```ts
supabase.channel('responder-locations-web').send({
  type: 'broadcast',
  event: 'location-update',
  payload: {
    responderId: string,      // stable per-device UUID
    name: string,             // shown in the marker popup
    lat: number,
    lng: number,
    responderType: 'ambulance' | 'police' | 'fire',
  },
});
```

The dashboard listens on the same channel + event and reads from `msg.payload.*`. (There used to be a bug in the dashboard where it read from `msg.*` directly — fixed alongside this app.)

## Why not the same APK as expo-app?

The driver app and the responder app are different products for different users with different security postures (a responder app might one day need an org-issued login, audit logging, dispatcher-side controls, etc). Keeping them as separate Expo projects on a shared Supabase backend makes that boundary explicit and keeps each binary small.

## Known limitations (intentional, scoped for the hackathon)

- **No auth** — anyone with the Supabase anon key can publish to the channel. For real deployment, lock the channel with a JWT and verify the responder belongs to a registered dispatch org.
- **Foreground only** — `expo-location` watchers are killed when the OS suspends the app. A real production version would use a foreground service (Android) / significant-location-change (iOS) so the responder doesn't lose visibility when the screen goes off.
- **Ephemeral state** — broadcasts are not persisted to the `responders` Supabase table. On dashboard refresh the responder list starts empty until the next broadcast. Easy to add a row upsert if you need crash recovery.
- **No "claim incident"** — the responder app doesn't yet let a responder accept a specific SOS. Possible follow-up: subscribe to `incidents` INSERTs, show a popup, write the responder id back to the row.
