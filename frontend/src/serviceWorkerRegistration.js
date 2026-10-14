// Registers the PrintX service worker (public/service-worker.js).
//
// Registration happens ONLY in a production build and only when the browser
// supports service workers. In development (craco start) it is a no-op, and we
// proactively unregister any stale worker so local dev is never served from a
// cached shell. This keeps the live job/SSE/upload flows unaffected while
// developing.

const SW_URL = '/service-worker.js';

export function register() {
  if (process.env.NODE_ENV !== 'production') {
    // Dev: make sure no previously-installed SW interferes with hot reload.
    unregister();
    return;
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((registration) => {
        // Check for an updated worker immediately on load (so a returning
        // visitor / installed PWA picks up a new deploy promptly instead of
        // being stuck on a stale app shell that may point at an old backend
        // URL — the cause of "No demo devices" / "Reconnecting" after a deploy).
        registration.update().catch(() => {});

        // When a new worker finishes installing AND an old one is already in
        // control, an update is ready. Tell it to activate now (SKIP_WAITING);
        // the controllerchange handler below then reloads ONCE to load the
        // fresh shell. A first-ever install has no existing controller, so this
        // never reloads on the initial visit.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(() => {
        // Registration failure must never break the app; it just means no
        // offline shell this session.
      });

    // When the active worker changes (because a waiting one took over via
    // SKIP_WAITING), reload exactly once to swap to the fresh bundle. Guarded so
    // it cannot loop.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

export function unregister() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch(() => {
      /* nothing to unregister */
    });
}
