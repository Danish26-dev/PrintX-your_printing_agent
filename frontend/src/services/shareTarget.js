// Web Share Target receiver (customer side).
//
// When a user shares a PDF/DOCX from another app into the installed PrintX PWA,
// the service worker stashes the file and redirects to /workspace?shared=1.
// This module retrieves that stashed file from the SW cache and reconstructs a
// real File object so the app can feed it into the EXISTING upload flow — the
// shared file goes through exactly the same path as a normally-picked file.
//
// It is a no-op when the Cache API / service worker is unavailable, so it never
// affects browsers that don't support Web Share Target.

const SHARE_CACHE = 'printx-share-inbound';
const SHARE_SLOT = '/__shared-file';

/** True when the current navigation was triggered by a share into the app. */
export function wasSharedInto() {
  try {
    return new URLSearchParams(window.location.search).get('shared') === '1';
  } catch {
    return false;
  }
}

/**
 * Retrieve the file shared into the app (if any) and clear it from the cache so
 * it is consumed exactly once. Returns a File, or null when there is none.
 */
export async function consumeSharedFile() {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARE_SLOT);
    if (!res) return null;
    await cache.delete(SHARE_SLOT); // single-use hand-off
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get('X-Shared-Filename') || 'shared-document');
    const type = res.headers.get('Content-Type') || blob.type || 'application/octet-stream';
    return new File([blob], name, { type });
  } catch {
    return null;
  }
}

/** Remove the ?shared=1 marker from the URL without a reload. */
export function clearSharedFlag() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('shared')) {
      url.searchParams.delete('shared');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  } catch {
    /* ignore */
  }
}
