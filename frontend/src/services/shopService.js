// Shop discovery for the PrintX MVP.
//
// For the MVP there is exactly ONE shop: PrintX Lab. There is no multi-shop
// directory, no ratings system, no geolocation, and no shop-availability
// telemetry, so we do NOT fabricate any of those as if they were real data.
//
// The customer-facing document pipeline (upload, edit, preview, download,
// approval, print) is REAL via the Backend (see apiClient.js / fileService.js /
// chatService.js). This module only provides the single shop the customer can
// select to start that flow.
//
// PERSISTENCE LIMITATION (MVP): there is no backend "shops" table/endpoint yet.
// PrintX Lab is defined here as the single known shop. When a real shop
// directory + persistence is added, replace getShops/getShopById with calls to
// that endpoint; the component contract (id/name/isPrintX) stays the same.

/**
 * The single demo shop for the MVP: PrintX Lab.
 * Only fields the UI can truthfully show are included. We intentionally omit
 * rating / distance / "online status" because none of those are backed by real
 * data — showing them would be fabrication.
 */
export const PRINTX_LAB = {
  id: 'printx-lab',
  name: 'PrintsX Lab',
  isPrintX: true,
  aiEnabled: true, // true: the AI document pipeline is really wired up
  // Privacy-verified reflects that documents are processed by our own
  // deterministic engine (no third-party human handling), which is accurate.
  verified: true,
};

/** All shops available to the customer. MVP: exactly one — PrintX Lab. */
export const shops = [PRINTX_LAB];

export const getShops = async (searchQuery = '') => {
  // Single shop; honour a search filter only as a name match so the search box
  // still behaves, but there is nothing to fabricate.
  if (!searchQuery) return shops;
  const q = searchQuery.toLowerCase();
  return shops.filter((shop) => shop.name.toLowerCase().includes(q));
};

export const getShopById = async (shopId) => {
  return shops.find((shop) => String(shop.id) === String(shopId)) || null;
};
