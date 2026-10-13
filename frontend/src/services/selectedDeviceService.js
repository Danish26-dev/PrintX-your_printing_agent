// Single authoritative source of truth for the shopkeeper's SELECTED printer
// device. Persisted to localStorage so it survives navigation between the
// Dashboard and the Workspace and page reloads.
//
// Shape:
//   { id, name, mode: 'real' | 'demo', capabilities?: {...}, status?: string }
//
// RULES:
//   - `mode` is EXPLICIT ('real' or 'demo'). Selecting the Demo Printer sets
//     mode:'demo'; selecting a discovered device sets mode:'real'. There is no
//     silent fallback to demo.
//   - A null value means "no printer selected" — the UI must then disable
//     configuration actions and keep the cursor idle.

const KEY = 'printx.selectedDevice';
const listeners = new Set();

/** Read the current selected device, or null if none. */
export function getSelectedDevice() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Set (or clear with null) the selected device and notify subscribers. */
export function setSelectedDevice(device) {
  try {
    if (device) localStorage.setItem(KEY, JSON.stringify(device));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage may be unavailable; still notify in-memory listeners */
  }
  for (const fn of listeners) {
    try {
      fn(device);
    } catch {
      /* a bad listener must not break others */
    }
  }
}

/** Clear the selection. */
export function clearSelectedDevice() {
  setSelectedDevice(null);
}

/**
 * Subscribe to selection changes (same-tab via listeners, cross-tab via the
 * storage event). Returns an unsubscribe function.
 */
export function subscribeSelectedDevice(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key === KEY) fn(getSelectedDevice());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/** True when a device is selected. */
export function hasSelectedDevice() {
  return getSelectedDevice() != null;
}
