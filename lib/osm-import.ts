// Orchestrates an OpenStreetMap import into the Supabase `services` table:
// fetch via Overpass, de-dupe against what's already stored, and bulk-insert.
//
// De-dupe is two-layered so re-running an import (or importing overlapping
// city radii) never creates duplicate rows:
//   1. by OSM identity (tags.osm_id) — the same POI imported twice
//   2. by name + rounded coordinate — a manually-added row that matches a POI

import { createClient } from '@/lib/supabase/client';
import { fetchOsmServices, type OsmService } from '@/lib/overpass';

export interface ImportResult {
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
}

const INSERT_CHUNK = 200;

// 3-decimal rounding ≈ 110 m grid — close enough to treat two points as "the
// same place" for dedupe without merging genuinely distinct nearby services.
function coordKey(name: string, lat: number, lng: number): string {
  return `${name.trim().toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

type ExistingRow = {
  name: string;
  tags: Record<string, unknown> | null;
  location: { coordinates?: [number, number] } | null;
};

// Build the de-dupe sets from rows already in the table.
async function loadExistingKeys(): Promise<{ osmIds: Set<string>; coords: Set<string> }> {
  const supabase = createClient();
  const osmIds = new Set<string>();
  const coords = new Set<string>();
  const { data } = await supabase.from('services').select('name,tags,location').limit(20_000);
  for (const row of (data as ExistingRow[]) ?? []) {
    const osmId = row.tags && typeof row.tags['osm_id'] === 'string' ? (row.tags['osm_id'] as string) : '';
    if (osmId) osmIds.add(osmId);
    const lng = row.location?.coordinates?.[0];
    const lat = row.location?.coordinates?.[1];
    if (typeof lat === 'number' && typeof lng === 'number') {
      coords.add(coordKey(row.name, lat, lng));
    }
  }
  return { osmIds, coords };
}

function toInsertRow(svc: OsmService) {
  return {
    name: svc.name,
    service_type: svc.service_type,
    address: svc.address || null,
    city: svc.city || null,
    state: svc.state || null,
    country_code: 'IN',
    // PostGIS geometry input accepts WKT text directly via its type cast.
    location: `POINT(${svc.lng} ${svc.lat})`,
    primary_phone: svc.primary_phone || null,
    is_24x7: svc.is_24x7,
    tags: { source: 'overpass', osm_id: svc.osmId, website: svc.website || undefined },
  };
}

// Import one area. `existing` is passed in so an "import all cities" sweep can
// share a single de-dupe snapshot and accumulate keys across cities.
export async function importOsmArea(
  lat: number,
  lng: number,
  radiusKm: number,
  existing: { osmIds: Set<string>; coords: Set<string> },
): Promise<ImportResult> {
  let fetched: OsmService[];
  try {
    fetched = await fetchOsmServices(lat, lng, radiusKm);
  } catch (e) {
    return { fetched: 0, inserted: 0, skipped: 0, error: e instanceof Error ? e.message : 'Overpass fetch failed' };
  }

  const fresh: OsmService[] = [];
  let skipped = 0;
  for (const svc of fetched) {
    const cKey = coordKey(svc.name, svc.lat, svc.lng);
    if (existing.osmIds.has(svc.osmId) || existing.coords.has(cKey)) {
      skipped++;
      continue;
    }
    // Reserve the keys now so duplicates within this same batch are also caught.
    existing.osmIds.add(svc.osmId);
    existing.coords.add(cKey);
    fresh.push(svc);
  }

  if (fresh.length === 0) {
    return { fetched: fetched.length, inserted: 0, skipped };
  }

  const supabase = createClient();
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
    const chunk = fresh.slice(i, i + INSERT_CHUNK).map(toInsertRow);
    const { error } = await supabase.from('services').insert(chunk);
    if (error) {
      return { fetched: fetched.length, inserted, skipped, error: error.message };
    }
    inserted += chunk.length;
  }

  return { fetched: fetched.length, inserted, skipped };
}

// Convenience for a single-city import that builds its own de-dupe snapshot.
export async function importOsmCity(lat: number, lng: number, radiusKm: number): Promise<ImportResult> {
  const existing = await loadExistingKeys();
  return importOsmArea(lat, lng, radiusKm, existing);
}

export { loadExistingKeys };
