// OpenStreetMap (Overpass API) import for the responder dashboard.
//
// Pulls real emergency-service POIs — hospitals, clinics, police, fire/rescue,
// ambulance stations, towing (car repair) and puncture (tyre) shops — for a
// given area of India and normalizes them to the `services` table shape.
//
// A single nationwide Overpass query is NOT feasible (it times out and returns
// hundreds of MB), so the data is pulled per-city / per-radius. The admin page
// loops over INDIA_CITIES below to build national coverage one city at a time.
//
// Runs client-side: overpass-api.de sends `Access-Control-Allow-Origin: *`, so
// the browser fetch is allowed without a proxy.

import type { ServiceType } from './types';

// Public Overpass mirrors. Each round rotates which one is tried first so a
// rate-limited "import all cities" sweep doesn't keep hammering the same host.
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// Heavy metro queries (60 km radius can return >2,500 elements) need server
// time, so the client timeout has to comfortably exceed the in-query timeout.
const QUERY_TIMEOUT_S = 90;
const FETCH_TIMEOUT_MS = (QUERY_TIMEOUT_S + 10) * 1000;

// Retry the whole mirror set this many rounds before giving up on an area.
const MAX_ROUNDS = 4;
// Back-off before each retry round — gives the public rate limiter time to
// free a slot after a heavy query (the #1 cause of "Failed to fetch").
const ROUND_BACKOFF_MS = [0, 6_000, 14_000, 25_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OsmService {
  osmId: string; // "node/123", "way/456" — stable OSM identity, used for dedupe
  name: string;
  service_type: ServiceType;
  address: string;
  city: string;
  state: string;
  primary_phone: string;
  is_24x7: boolean;
  website: string;
  lat: number;
  lng: number;
}

export interface CityPreset {
  name: string;
  region: string;
  lat: number;
  lng: number;
}

// Curated spread of major cities across every region of India. Importing each
// at a ~25 km radius gives broad national coverage of emergency services
// without a single query ever exceeding Overpass limits.
export const INDIA_CITIES: CityPreset[] = [
  // North
  { name: 'Delhi NCR', region: 'North', lat: 28.6139, lng: 77.209 },
  { name: 'Chandigarh', region: 'North', lat: 30.7333, lng: 76.7794 },
  { name: 'Jaipur', region: 'North', lat: 26.9124, lng: 75.7873 },
  { name: 'Lucknow', region: 'North', lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur', region: 'North', lat: 26.4499, lng: 80.3319 },
  { name: 'Amritsar', region: 'North', lat: 31.634, lng: 74.8723 },
  { name: 'Dehradun', region: 'North', lat: 30.3165, lng: 78.0322 },
  // West
  { name: 'Mumbai', region: 'West', lat: 19.076, lng: 72.8777 },
  { name: 'Pune', region: 'West', lat: 18.5204, lng: 73.8567 },
  { name: 'Ahmedabad', region: 'West', lat: 23.0225, lng: 72.5714 },
  { name: 'Surat', region: 'West', lat: 21.1702, lng: 72.8311 },
  { name: 'Nagpur', region: 'West', lat: 21.1458, lng: 79.0882 },
  { name: 'Panaji (Goa)', region: 'West', lat: 15.4909, lng: 73.8278 },
  // South
  { name: 'Bengaluru', region: 'South', lat: 12.9716, lng: 77.5946 },
  { name: 'Chennai', region: 'South', lat: 13.0827, lng: 80.2707 },
  { name: 'Hyderabad', region: 'South', lat: 17.385, lng: 78.4867 },
  { name: 'Kochi', region: 'South', lat: 9.9312, lng: 76.2673 },
  { name: 'Coimbatore', region: 'South', lat: 11.0168, lng: 76.9558 },
  { name: 'Thiruvananthapuram', region: 'South', lat: 8.5241, lng: 76.9366 },
  { name: 'Mysuru', region: 'South', lat: 12.2958, lng: 76.6394 },
  { name: 'Visakhapatnam', region: 'South', lat: 17.6868, lng: 83.2185 },
  // East / North-East
  { name: 'Kolkata', region: 'East', lat: 22.5726, lng: 88.3639 },
  { name: 'Patna', region: 'East', lat: 25.5941, lng: 85.1376 },
  { name: 'Bhubaneswar', region: 'East', lat: 20.2961, lng: 85.8245 },
  { name: 'Guwahati', region: 'East', lat: 26.1445, lng: 91.7362 },
  { name: 'Ranchi', region: 'East', lat: 23.3441, lng: 85.3096 },
  // Central
  { name: 'Bhopal', region: 'Central', lat: 23.2599, lng: 77.4126 },
  { name: 'Indore', region: 'Central', lat: 22.7196, lng: 75.8577 },
  { name: 'Raipur', region: 'Central', lat: 21.2514, lng: 81.6296 },
];

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// Map an OSM element's tags onto one of the 7 service_type values the DB CHECK
// constraint allows. Returns null for anything we don't want to import.
// Fire/rescue stations map to `ambulance` — in India fire & emergency services
// are first responders that dispatch rescue + ambulance to road accidents, and
// the table has no dedicated fire type.
function mapServiceType(tags: Record<string, string>): ServiceType | null {
  const amenity = tags.amenity || '';
  const shop = tags.shop || '';
  const emergency = tags.emergency || '';
  const healthcare = tags.healthcare || '';

  if (amenity === 'hospital' || healthcare === 'hospital') return 'hospital';
  if (amenity === 'clinic' || amenity === 'doctors' || healthcare === 'clinic') return 'hospital';
  if (amenity === 'police') return 'police';
  if (amenity === 'fire_station' || emergency === 'fire_station') return 'ambulance';
  if (amenity === 'ambulance_station' || emergency === 'ambulance_station') return 'ambulance';
  if (shop === 'tyres') return 'puncture';
  if (amenity === 'car_repair' || shop === 'car_repair') return 'towing';
  return null;
}

function buildQuery(lat: number, lng: number, radiusKm: number): string {
  const r = Math.round(radiusKm * 1000);
  // `nwr` = node|way|relation. Hospitals/police are usually mapped as building
  // polygons (ways), so node-only queries miss most of them. `out center tags`
  // gives a representative coordinate for ways/relations.
  return `
[out:json][timeout:${QUERY_TIMEOUT_S}];
(
  nwr["amenity"="hospital"](around:${r},${lat},${lng});
  nwr["amenity"="clinic"](around:${r},${lat},${lng});
  nwr["amenity"="doctors"](around:${r},${lat},${lng});
  nwr["amenity"="police"](around:${r},${lat},${lng});
  nwr["amenity"="fire_station"](around:${r},${lat},${lng});
  nwr["emergency"="ambulance_station"](around:${r},${lat},${lng});
  nwr["amenity"="car_repair"](around:${r},${lat},${lng});
  nwr["shop"="car_repair"](around:${r},${lat},${lng});
  nwr["shop"="tyres"](around:${r},${lat},${lng});
);
out center tags;
`;
}

function toOsmService(el: OverpassElement): OsmService | null {
  if (!el.tags) return null;

  const serviceType = mapServiceType(el.tags);
  if (!serviceType) return null;

  // Coordinate: nodes carry lat/lon directly, ways/relations carry `center`.
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;

  const tags = el.tags;
  const name = tags.name || tags['name:en'] || tags['name:hi'] || '';
  // Skip unnamed POIs — an anonymous "Service #123" on the dispatcher map is
  // noise, not a usable referral.
  if (!name.trim()) return null;

  const phone = tags.phone || tags['contact:phone'] || tags['phone:mobile'] || '';
  const website = tags.website || tags['contact:website'] || '';
  const openingHours = tags.opening_hours || '';
  const is24x7 =
    openingHours === '24/7' ||
    openingHours === 'Mo-Su 00:00-24:00' ||
    tags.emergency === 'yes' ||
    // hospitals & police/fire/ambulance stations run round-the-clock
    serviceType === 'police' ||
    serviceType === 'ambulance' ||
    serviceType === 'hospital';

  const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || '';
  const state = tags['addr:state'] || '';
  const addressParts = [
    tags['addr:housenumber'] && tags['addr:street']
      ? `${tags['addr:housenumber']} ${tags['addr:street']}`
      : tags['addr:street'],
    tags['addr:suburb'],
    city,
    state,
    tags['addr:postcode'],
  ].filter(Boolean);

  return {
    osmId: `${el.type}/${el.id}`,
    name: name.slice(0, 120),
    service_type: serviceType,
    address: addressParts.join(', ').slice(0, 240),
    city: city.slice(0, 80),
    state: state.slice(0, 80),
    primary_phone: phone.slice(0, 24),
    is_24x7: is24x7,
    website,
    lat,
    lng,
  };
}

function parseElements(data: OverpassResponse): OsmService[] {
  const seen = new Set<string>();
  const out: OsmService[] = [];
  for (const el of data.elements ?? []) {
    const svc = toOsmService(el);
    if (!svc) continue;
    // De-dupe within a single response (an entity can appear as both a node
    // and the centroid of its way).
    if (seen.has(svc.osmId)) continue;
    seen.add(svc.osmId);
    out.push(svc);
  }
  return out;
}

// One POST to one mirror. Returns parsed services, or throws on any failure so
// the caller can rotate/retry.
async function fetchFromMirror(endpoint: string, query: string): Promise<OsmService[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    });
    // 429 = rate-limited, 504 = server-side query timeout — both are retryable.
    if (res.status === 429) throw new Error('rate-limited (429)');
    if (res.status === 504) throw new Error('server timeout (504)');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as OverpassResponse;
    return parseElements(data);
  } finally {
    clearTimeout(timeout);
  }
}

// Fetch + normalize emergency services around a point. Tries every mirror, and
// on total failure backs off and retries up to MAX_ROUNDS times — the public
// Overpass rate limiter rejects bursts of heavy queries, so a wait-and-retry is
// what makes a full "import all cities" sweep reliable. `onAttempt` surfaces
// progress to the UI ("rate-limited, retrying in 14s…"). Throws only after all
// rounds are exhausted.
export async function fetchOsmServices(
  lat: number,
  lng: number,
  radiusKm: number,
  onAttempt?: (msg: string) => void,
): Promise<OsmService[]> {
  const query = buildQuery(lat, lng, radiusKm);
  let lastError: unknown = null;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0) {
      const wait = ROUND_BACKOFF_MS[round] ?? 25_000;
      const reason = lastError instanceof Error ? lastError.message : 'failed';
      onAttempt?.(`   ${reason} — retrying in ${Math.round(wait / 1000)}s (${round + 1}/${MAX_ROUNDS})…`);
      await sleep(wait);
    }
    // Rotate which mirror leads each round so we don't always start on a host
    // that just rate-limited us.
    for (let k = 0; k < OVERPASS_ENDPOINTS.length; k++) {
      const endpoint = OVERPASS_ENDPOINTS[(round + k) % OVERPASS_ENDPOINTS.length]!;
      try {
        return await fetchFromMirror(endpoint, query);
      } catch (e) {
        lastError = e instanceof Error && e.name === 'AbortError' ? new Error('timeout') : e;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All Overpass mirrors failed');
}
