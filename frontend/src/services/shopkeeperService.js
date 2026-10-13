// Shopkeeper auth + account + order-acceptance state.
//
// DEMO/LOCAL ONLY: there is no shopkeeper backend yet. All state here lives in
// localStorage and is clearly isolated so it can later be replaced by real API
// calls without touching the UI components.

const SHOPKEEPER_KEY = 'shopkeeper';
const ORDER_ACCEPTING_KEY = 'printx_accepting_orders';
const AGENT_ACTIVE_KEY = 'agentActive';

/** Returns the logged-in shopkeeper object, or null. */
export function getShopkeeper() {
  try {
    const raw = localStorage.getItem(SHOPKEEPER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getShopkeeper());
}

/**
 * Store a shopkeeper profile from a VERIFIED Firebase sign-in. The backend is
 * the real authority (it verifies the ID token + allowlist); this profile is
 * only for showing who is signed in and gating the frontend routes.
 */
export function loginWithFirebase({ email, name } = {}) {
  const profile = {
    shopName: 'PrintX Lab',
    shopkeeperName: name || email || 'Shopkeeper',
    email: email || '',
    shopId: 'SHOP-PX-001',
    printerName: 'Shop Printer 01',
    loggedIn: true,
    authProvider: 'firebase',
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(SHOPKEEPER_KEY, JSON.stringify(profile));
  return profile;
}

/**
 * The shopkeeper API token sent on shopkeeper-only Backend calls
 * (configure-printer, submit-print, shop feeds). It comes from the build-time
 * env (REACT_APP_SHOPKEEPER_API_TOKEN) or the stored shopkeeper profile. Empty
 * when running the no-auth MVP locally. Must match the Backend's
 * SHOPKEEPER_API_TOKEN. Never logged.
 */
export function getShopkeeperToken() {
  const envToken = process.env.REACT_APP_SHOPKEEPER_API_TOKEN;
  if (envToken && envToken.trim()) return envToken.trim();
  const profile = getShopkeeper();
  return profile?.apiToken || '';
}

/** Mock login — any credentials work (demo). Stores a shopkeeper profile. */
export function login({ shopName, email } = {}) {
  const profile = {
    shopName: shopName || 'PrintX Demo Lab',
    shopkeeperName: 'Shop Owner',
    email: email || 'owner@printx.demo',
    shopId: 'SHOP-PX-001',
    printerName: 'Shop Printer 01',
    loggedIn: true,
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(SHOPKEEPER_KEY, JSON.stringify(profile));
  return profile;
}

export function updateProfile(patch) {
  const current = getShopkeeper() || {};
  const next = { ...current, ...patch };
  localStorage.setItem(SHOPKEEPER_KEY, JSON.stringify(next));
  return next;
}

export function logout() {
  localStorage.removeItem(SHOPKEEPER_KEY);
}

/** Order-acceptance toggle (local). Customers would read this to know if a shop
 * is available. Persisted so it survives reloads. */
export function isAcceptingOrders() {
  const raw = localStorage.getItem(ORDER_ACCEPTING_KEY);
  return raw === null ? true : raw === 'true';
}

export function setAcceptingOrders(value) {
  localStorage.setItem(ORDER_ACCEPTING_KEY, String(Boolean(value)));
  return Boolean(value);
}

export function isAgentActive() {
  const raw = localStorage.getItem(AGENT_ACTIVE_KEY);
  return raw === null ? true : raw === 'true' || raw === '"true"' || raw === 'true';
}

export function setAgentActive(value) {
  localStorage.setItem(AGENT_ACTIVE_KEY, JSON.stringify(Boolean(value)));
  return Boolean(value);
}
