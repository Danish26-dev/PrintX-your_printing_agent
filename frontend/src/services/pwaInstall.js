// PWA install detection + prompt handling. Keeps all the browser-quirk logic in
// one place so the UI can render an HONEST install affordance:
//   - Chromium (Android/desktop): capture `beforeinstallprompt`, show a button
//     that triggers the REAL native prompt. Hide once installed.
//   - iOS Safari: there is no beforeinstallprompt; offer instructions for
//     Share -> Add to Home Screen (the only real path on iOS).
//   - Already installed / running standalone: offer nothing (no fake button).
//   - Unsupported browser (no prompt, not iOS): offer nothing.

/** True when the app is running as an installed PWA (standalone display). */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  const mql = window.matchMedia && window.matchMedia('(display-mode: standalone)');
  // iOS Safari exposes navigator.standalone instead of the display-mode MQ.
  return Boolean((mql && mql.matches) || window.navigator.standalone === true);
}

/** True for iOS Safari (iPhone/iPad), where install is via the Share sheet. */
export function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac; detect via touch.
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOSDevice && isSafari;
}

// Module-level holder for the deferred native prompt (fired before React mounts
// in some browsers, so we start listening immediately on import).
let deferredPrompt = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a bad listener must not break the others */
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's mini-infobar; we provide our own button instead.
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/** Whether a real native install prompt is currently available. */
export function canPromptInstall() {
  return deferredPrompt != null;
}

/**
 * Trigger the native install prompt. Returns the user's choice outcome
 * ('accepted' | 'dismissed') or null when no real prompt is available (so the
 * caller never pretends an install happened).
 */
export async function promptInstall() {
  if (!deferredPrompt) return null;
  const promptEvent = deferredPrompt;
  deferredPrompt = null; // a prompt can only be used once
  notify();
  try {
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    return choice && choice.outcome ? choice.outcome : null;
  } catch {
    return null;
  }
}

/** Subscribe to install-availability changes. Returns an unsubscribe fn. */
export function subscribeInstall(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The install affordance the UI should show right now:
 *   'prompt'  -> a working native-prompt button
 *   'ios'     -> iOS Share -> Add to Home Screen instructions
 *   'none'    -> nothing (installed, or unsupported) — never a fake button
 */
export function installMode() {
  if (isStandalone()) return 'none';
  if (canPromptInstall()) return 'prompt';
  if (isIos()) return 'ios';
  return 'none';
}
