import { ASSET_MAP, getAllFrameUrls, type AssetMap, type FrameUrl } from './Asset_Map';

const _cache: Map<FrameUrl, HTMLImageElement> = new Map();
const _failed: Set<FrameUrl> = new Set();
let _preloadPromise: Promise<void> | null = null;

/**
 * Preload all frame URLs in the given map.
 * Returns a single Promise that resolves once every URL has either loaded
 * OR failed to load (errors are caught — preload NEVER rejects, per Req 7.8).
 */
export function preloadAll(map: AssetMap = ASSET_MAP): Promise<void> {
  if (_preloadPromise) return _preloadPromise;

  const urls = getAllFrameUrls(map);

  _preloadPromise = Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          // Skip if already cached
          if (_cache.has(url)) {
            resolve();
            return;
          }
          if (typeof Image === 'undefined') {
            // Non-DOM env (test setup may run without jsdom for some files).
            // Treat as success — the renderer will lazy-load via <img> at runtime.
            resolve();
            return;
          }
          const img = new Image();
          img.onload = () => {
            _cache.set(url, img);
            resolve();
          };
          img.onerror = () => {
            _failed.add(url);
            // eslint-disable-next-line no-console
            console.error('[Asset_Preloader] Failed to load:', url);
            resolve(); // never reject
          };
          img.src = url;
        }),
    ),
  ).then(() => undefined);

  return _preloadPromise;
}

/**
 * Get a cached image element if previously loaded.
 */
export function getCached(url: FrameUrl): HTMLImageElement | undefined {
  return _cache.get(url);
}

/**
 * Check if a URL was attempted but failed.
 */
export function didFail(url: FrameUrl): boolean {
  return _failed.has(url);
}

/**
 * Reset for testing.
 */
export function _resetForTest(): void {
  _cache.clear();
  _failed.clear();
  _preloadPromise = null;
}
