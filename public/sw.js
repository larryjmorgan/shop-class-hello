/* StoryBox service worker: makes the app work offline after the first visit and keeps it fast.
 * When the app is built, vite.config.ts fills in the build id and the list of files to keep for offline use
 * (the two placeholder values just below).
 * It only ever touches files from this same site: calls to ElevenLabs etc. pass straight through. */
const CACHE = 'storybox-__BUILD_ID__';
const PRECACHE = "__PRECACHE__";

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(Array.isArray(PRECACHE) ? PRECACHE : [])),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('storybox-') && key !== CACHE) await caches.delete(key); // old deploys
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(req.mode === 'navigate' ? pageNetworkFirst(req) : fileCacheFirst(req));
});

// The page itself: always try the network first so a new deploy shows up; fall back to the saved copy offline.
async function pageNetworkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match(new URL('./', self.registration.scope).href)) ||
      (await cache.match(new URL('./index.html', self.registration.scope).href)) ||
      Response.error()
    );
  }
}

// Scripts, styles, icons: these have a new name (or a new cache) on every deploy, so the saved copy is always right.
async function fileCacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
