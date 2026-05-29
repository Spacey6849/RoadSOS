// Offline map-tile cache.
//
// The Leaflet runtime is already bundled into the WebView (see LeafletMap.tsx),
// so the ONLY thing the map needs the network for is the raster tile imagery.
// This module pre-downloads the tiles around the user's location while online
// and stores them on disk, so the map still renders with no signal — the case
// that matters most for a crash-response app, since crashes happen where you
// already are.
//
// Tiles are served back to the WebView as base64 data URIs over the existing
// postMessage bridge (getCachedTileDataUri), with a live-network fallback for
// any tile that isn't cached.
//
// NOTE: bulk-downloading from tile.openstreetmap.org is against OSM's tile
// usage policy at scale. The radius/zoom caps below keep a single prefetch to
// a few hundred tiles (demo-scale). For production, point TILE_ENDPOINT at a
// provider that permits caching (MapTiler / Stadia / self-hosted).

import * as FileSystem from 'expo-file-system/legacy';

const TILE_DIR = (FileSystem.documentDirectory ?? '') + 'map-tiles/';

// Single subdomain (policy-friendlier than rotating a/b/c for bulk pulls).
const TILE_ENDPOINT = (z: number, x: number, y: number): string =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

// Street-level zooms around the user. High zooms explode in tile count, so the
// radius is deliberately small — the WebView HTTP cache (cacheMode) covers
// anywhere the user pans to while online.
const DEFAULT_ZOOMS = [12, 13, 14, 15, 16];
const DEFAULT_RADIUS_KM = 6;
const KM_PER_DEG_LAT = 111;
// Hard safety cap so a bad radius/zoom combo can never try to pull tens of
// thousands of tiles.
const MAX_TILES = 2000;
const DOWNLOAD_CONCURRENCY = 4;
// Rough average tile size for storage estimates without stat-ing every file.
const AVG_TILE_BYTES = 18_000;

export interface CacheProgress {
  done: number;
  total: number;
}

export interface CacheResult {
  cached: number;
  skipped?: boolean;
  error?: string;
}

interface CacheOptions {
  zooms?: number[];
  radiusKm?: number;
}

interface Tile {
  z: number;
  x: number;
  y: number;
}

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function lat2tile(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z));
}

function clampTile(v: number, z: number): number {
  const max = Math.pow(2, z) - 1;
  return Math.max(0, Math.min(max, v));
}

// Every tile covering a square ~radiusKm around (lat,lng) across the zooms.
function tilesForRegion(lat: number, lng: number, zooms: number[], radiusKm: number): Tile[] {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLng = radiusKm / (KM_PER_DEG_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const tiles: Tile[] = [];
  for (const z of zooms) {
    const xMin = clampTile(lon2tile(lng - dLng, z), z);
    const xMax = clampTile(lon2tile(lng + dLng, z), z);
    // y grows southward, so the northern edge (lat+dLat) is the smaller y.
    const yMin = clampTile(lat2tile(lat + dLat, z), z);
    const yMax = clampTile(lat2tile(lat - dLat, z), z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

function tilePath(z: number, x: number, y: number): string {
  return `${TILE_DIR}${z}_${x}_${y}.png`;
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TILE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(TILE_DIR, { intermediates: true });
}

// Guard so two screens can't kick off overlapping prefetch sweeps.
let caching = false;

/**
 * Download (and persist) the tiles around a point. Idempotent — already-cached
 * tiles are skipped, so this can be called repeatedly as the user moves. Fails
 * soft: individual tile failures (e.g. offline) are swallowed.
 */
export async function cacheRegion(
  lat: number,
  lng: number,
  opts: CacheOptions = {},
  onProgress?: (p: CacheProgress) => void,
): Promise<CacheResult> {
  if (caching) return { cached: 0, skipped: true };
  if (!FileSystem.documentDirectory) return { cached: 0, error: 'no filesystem' };
  caching = true;
  try {
    await ensureDir();
    const zooms = opts.zooms ?? DEFAULT_ZOOMS;
    const radiusKm = opts.radiusKm ?? DEFAULT_RADIUS_KM;
    let tiles = tilesForRegion(lat, lng, zooms, radiusKm);
    if (tiles.length > MAX_TILES) tiles = tiles.slice(0, MAX_TILES);

    const total = tiles.length;
    let done = 0;
    let idx = 0;

    const worker = async (): Promise<void> => {
      while (idx < tiles.length) {
        const t = tiles[idx++];
        if (!t) break;
        const path = tilePath(t.z, t.x, t.y);
        try {
          const info = await FileSystem.getInfoAsync(path);
          if (!info.exists) {
            await FileSystem.downloadAsync(TILE_ENDPOINT(t.z, t.x, t.y), path);
          }
        } catch {
          // offline / 404 / rate-limited — skip this tile, keep going
        }
        done++;
        onProgress?.({ done, total });
      }
    };

    await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));
    return { cached: total };
  } catch (e) {
    return { cached: 0, error: e instanceof Error ? e.message : 'cache failed' };
  } finally {
    caching = false;
  }
}

/**
 * Return a cached tile as a base64 PNG data URI, or null if it isn't cached.
 * Called per-tile by the WebView bridge; null tells the map to fetch live.
 */
export async function getCachedTileDataUri(z: number, x: number, y: number): Promise<string | null> {
  try {
    if (!FileSystem.documentDirectory) return null;
    const path = tilePath(z, x, y);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || (typeof info.size === 'number' && info.size === 0)) return null;
    const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}

/** Cheap status for UI — tile count + estimated bytes (no per-file stat). */
export async function getCacheInfo(): Promise<{ tiles: number; bytes: number }> {
  try {
    const info = await FileSystem.getInfoAsync(TILE_DIR);
    if (!info.exists) return { tiles: 0, bytes: 0 };
    const files = await FileSystem.readDirectoryAsync(TILE_DIR);
    return { tiles: files.length, bytes: files.length * AVG_TILE_BYTES };
  } catch {
    return { tiles: 0, bytes: 0 };
  }
}

export async function clearTileCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(TILE_DIR, { idempotent: true });
  } catch {
    // nothing to clear
  }
}
