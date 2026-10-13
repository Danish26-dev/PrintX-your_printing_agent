/**
 * Canonical shop ("channel") definition for the PrintX MVP.
 *
 * PrintX Lab is the ONLY shop/channel in the MVP. Every customer job is
 * associated with this shop so the shopkeeper dashboard can reliably query the
 * jobs that belong to it. This module is the single source of truth for the
 * shop id — the frontend `shopService.js` uses the SAME id ('printx-lab'), and
 * the shopkeeper job feed (`GET /api/shop/jobs`) filters by it.
 *
 * DESIGN:
 *   - Jobs created without a shopId default to PRINTX_LAB_SHOP_ID.
 *   - A client-supplied shopId is NEVER trusted blindly: it is validated with
 *     `resolveShopId()`, which falls back to PrintX Lab for any unknown value.
 *   - Adding a real multi-shop directory later only requires extending
 *     KNOWN_SHOP_IDS and the resolution logic; the job/field contract is
 *     unchanged.
 */

/** The canonical id of the single MVP shop. Matches the frontend shopService. */
export const PRINTX_LAB_SHOP_ID = 'printx-lab';

/** All shop ids the backend recognises. MVP: exactly one. */
export const KNOWN_SHOP_IDS: ReadonlySet<string> = new Set([PRINTX_LAB_SHOP_ID]);

/**
 * Validate + resolve a (possibly client-supplied, possibly absent) shopId to a
 * KNOWN shop id. Any missing, non-string, or unrecognised value resolves to
 * PrintX Lab — the single MVP shop — so a job is never left unassociated and a
 * forged value can never point a job at a shop that does not exist.
 */
export function resolveShopId(candidate?: unknown): string {
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (KNOWN_SHOP_IDS.has(trimmed)) return trimmed;
  }
  return PRINTX_LAB_SHOP_ID;
}

/** True when a job's shopId belongs to the given shop (missing => PrintX Lab). */
export function jobBelongsToShop(jobShopId: string | null | undefined, shopId: string): boolean {
  return resolveShopId(jobShopId ?? undefined) === resolveShopId(shopId);
}
