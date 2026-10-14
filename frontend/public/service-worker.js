/* PrintX service worker — minimal, dependency-free, CRA/CRACO-compatible.
 *
 * WHAT IT CACHES (safe static app shell ONLY):
 *   - the app shell: "/" and "/index.html"
 *   - the manifest and PWA icons
 *   - hashed build assets under "/static/" (JS/CSS/media) — content-hashed by
 *     CRA, so cache-first is safe and self-invalidating across deploys
 *
 * WHAT IT NEVER CACHES (always goes to the network, never stored):
 *   - anything under "/api/" (jobs, uploads, printers, shop feeds, SSE)
 *   - document previews / downloads ("/api/jobs/<id>/preview|download")
 *   - any cross-origin request (backend on another origin, Google Fonts,
 *     Firebase, Vertex, etc.)
 *   - any request carrying an Authorization header (auth tokens)
 *   - any non-GET request (uploads, approvals, print submissions)
 *
 * It NEVER replays or resubmits requests. Offline, only navigations fall back
 * to the cached shell so the UI loads; live data calls then fail with the
 * app's existing honest network error (the user can retry manually).
 */

// Bump this version on any change that must invalidate the cached app shell
// (e.g. a new backend URL baked into the bundle). The 'activate' handler
// deletes every cache whose key !== CACHE, so bumping it purges the OLD
// precached index.html + static assets and forces a fresh fetch. This is what
// prevents an installed PWA / returning visitor from being stuck on a stale
// bundle that still points at the old backend URL.
const CACHE = 'printx-static-v2';

// App-shell assets safe to precache at install.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is atomic; if one asset 404s during dev it would reject, so add
      // individually and ignore per-asset failures to stay robust.
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Allow the page to tell a waiting SW to activate immediately (used on update).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico'
  );
}

// Cache that briefly holds a file shared INTO the app via the Web Share Target,
// so the React app can pick it up after the share redirect. It holds ONLY a
// user-shared file for a single hand-off — never API data or documents fetched
// from the backend.
const SHARE_CACHE = 'printx-share-inbound';
const SHARE_SLOT = '/__shared-file';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const reqUrl = new URL(request.url);

  // --- Web Share Target: receive a shared file (POST /share-target) ---
  // The OS share sheet POSTs multipart/form-data here. We stash the file and
  // redirect to the workspace, where the app ingests it through the EXISTING
  // upload flow. This is handled entirely in the SW + app — no backend change.
  if (
    request.method === 'POST' &&
    reqUrl.origin === self.location.origin &&
    reqUrl.pathname === '/share-target'
  ) {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();
          const file = form.get('file');
          if (file && typeof file.name === 'string') {
            const cache = await caches.open(SHARE_CACHE);
            // Store the raw bytes under a known slot with headers that let the
            // app reconstruct a File (name + type).
            await cache.put(
              SHARE_SLOT,
              new Response(file, {
                headers: {
                  'Content-Type': file.type || 'application/octet-stream',
                  'X-Shared-Filename': encodeURIComponent(file.name),
                },
              }),
            );
          }
        } catch {
          /* if anything fails, fall through to a normal redirect */
        }
        // Redirect (GET) into the workspace; the app reads the stashed file.
        return Response.redirect('/workspace?shared=1', 303);
      })(),
    );
    return;
  }

  // Only ever touch GET requests. Uploads/approvals/prints (POST/DELETE/etc.)
  // are passed straight through and NEVER intercepted or cached.
  if (request.method !== 'GET') return;

  const url = reqUrl;

  // Same-origin only. Cross-origin (backend on another origin, fonts, Firebase,
  // Vertex, etc.) is left entirely to the browser — never cached.
  if (url.origin !== self.location.origin) return;

  // Never handle API / private document traffic. Even same-origin, these must
  // always hit the network and are never stored.
  if (url.pathname.startsWith('/api/')) return;

  // Never cache a request that carries an auth token.
  if (request.headers.get('authorization')) return;

  // Navigations (HTML documents / SPA routes): network-first so fresh HTML and
  // auth state are used online; fall back to the cached shell when offline so
  // the app still loads (data calls then fail with the app's honest error).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => cached || caches.match('/')),
      ),
    );
    return;
  }

  // Hashed static assets: cache-first (content-hashed names make this safe and
  // self-invalidating). Cache only successful, same-origin ("basic") responses.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Everything else same-origin and non-API: just go to the network (no cache).
});
