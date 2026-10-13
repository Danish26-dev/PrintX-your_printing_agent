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
        // When a new worker is found, let it install; it will take over on the
        // next navigation. We do NOT force-reload (which could interrupt an
        // in-progress upload/edit).
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // 'installed' with an existing controller => an update is ready.
            // It activates on the next load; no disruptive auto-reload here.
          });
        });
      })
      .catch(() => {
        // Registration failure must never break the app; it just means no
        // offline shell this session.
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
