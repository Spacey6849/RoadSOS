/// <reference types="jest" />

// Mock the legacy expo-file-system API the tile cache depends on. The factory
// is hoisted above the imports, so `documentDirectory` is set before
// tile-cache.ts computes its TILE_DIR at module load.
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  downloadAsync: jest.fn(() => Promise.resolve({ uri: 'x', status: 200 })),
  readAsStringAsync: jest.fn(() => Promise.resolve('B64')),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  deleteAsync: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FS = require('expo-file-system/legacy');
const {
  getCachedTileDataUri,
  cacheRegion,
  getCacheInfo,
  clearTileCache,
} = require('../../lib/tile-cache');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCachedTileDataUri', () => {
  it('returns a base64 PNG data URI when the tile is cached', async () => {
    FS.getInfoAsync.mockResolvedValue({ exists: true, size: 120 });
    FS.readAsStringAsync.mockResolvedValue('ABC123');

    const uri = await getCachedTileDataUri(14, 100, 200);

    expect(uri).toBe('data:image/png;base64,ABC123');
    expect(FS.readAsStringAsync).toHaveBeenCalledWith(
      'file:///doc/map-tiles/14_100_200.png',
      { encoding: 'base64' },
    );
  });

  it('returns null when the tile is not cached', async () => {
    FS.getInfoAsync.mockResolvedValue({ exists: false });

    const uri = await getCachedTileDataUri(14, 1, 1);

    expect(uri).toBeNull();
    expect(FS.readAsStringAsync).not.toHaveBeenCalled();
  });

  it('returns null for a zero-byte (corrupt) tile', async () => {
    FS.getInfoAsync.mockResolvedValue({ exists: true, size: 0 });

    expect(await getCachedTileDataUri(14, 1, 1)).toBeNull();
  });

  it('fails soft to null when the filesystem throws', async () => {
    FS.getInfoAsync.mockRejectedValue(new Error('disk error'));

    expect(await getCachedTileDataUri(14, 1, 1)).toBeNull();
  });
});

describe('cacheRegion', () => {
  it('downloads every uncached tile in the region and reports progress', async () => {
    // dir exists; no tile exists yet → all are downloaded.
    FS.getInfoAsync.mockResolvedValue({ exists: false });
    const progress: number[] = [];

    const res = await cacheRegion(15.49, 73.82, {}, (p: { done: number; total: number }) => {
      progress.push(p.done);
    });

    expect(res.cached).toBeGreaterThan(0);
    // One download per processed tile (none were already cached).
    expect(FS.downloadAsync).toHaveBeenCalledTimes(res.cached);
    // Progress is monotonic and ends at the total.
    expect(progress[progress.length - 1]).toBe(res.cached);
  });

  it('skips tiles that are already on disk (no re-download)', async () => {
    // Everything reports as existing → nothing is fetched.
    FS.getInfoAsync.mockResolvedValue({ exists: true, size: 100 });

    const res = await cacheRegion(15.49, 73.82);

    expect(res.cached).toBeGreaterThan(0);
    expect(FS.downloadAsync).not.toHaveBeenCalled();
  });

  it('respects the radius — a smaller radius caches fewer tiles', async () => {
    FS.getInfoAsync.mockResolvedValue({ exists: false });

    const small = await cacheRegion(15.49, 73.82, { zooms: [14], radiusKm: 2 });
    const big = await cacheRegion(15.49, 73.82, { zooms: [14], radiusKm: 10 });

    expect(big.cached).toBeGreaterThan(small.cached);
  });

  it('creates the tile directory when it does not exist', async () => {
    FS.getInfoAsync.mockResolvedValue({ exists: false });

    await cacheRegion(15.49, 73.82, { zooms: [12], radiusKm: 2 });

    expect(FS.makeDirectoryAsync).toHaveBeenCalledWith(
      'file:///doc/map-tiles/',
      { intermediates: true },
    );
  });
});

describe('getCacheInfo', () => {
  it('reports the tile count and an estimated size', async () => {
    FS.getInfoAsync.mockResolvedValue({ exists: true });
    FS.readDirectoryAsync.mockResolvedValue(['12_1_1.png', '12_1_2.png', '13_1_1.png']);

    const info = await getCacheInfo();

    expect(info.tiles).toBe(3);
    expect(info.bytes).toBeGreaterThan(0);
  });

  it('reports an empty cache when the directory is missing', async () => {
    FS.getInfoAsync.mockResolvedValue({ exists: false });

    expect(await getCacheInfo()).toEqual({ tiles: 0, bytes: 0 });
  });
});

describe('clearTileCache', () => {
  it('deletes the tile directory idempotently', async () => {
    await clearTileCache();

    expect(FS.deleteAsync).toHaveBeenCalledWith(
      'file:///doc/map-tiles/',
      { idempotent: true },
    );
  });
});
