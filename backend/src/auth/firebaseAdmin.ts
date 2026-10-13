/**
 * Firebase Admin ID-token verification for shopkeeper authentication.
 *
 * The Firebase Admin SDK is loaded via dynamic import so local dev/tests (which
 * use AUTH_MODE=none or 'token') never need the dependency installed. On Cloud
 * Run the SDK initialises from Application Default Credentials (the service
 * account identity) — NO service-account JSON key file is used or downloaded.
 *
 * verifyShopkeeper() returns a decision the middleware maps to HTTP:
 *   { ok:true, email }                      -> authorized
 *   { ok:false, status:401 }                -> missing/invalid token
 *   { ok:false, status:403 }                -> valid token, not a shopkeeper
 */
import { config } from '../config.js';

export interface AuthDecision {
  ok: boolean;
  status?: 401 | 403 | 500;
  email?: string;
  reason?: string;
}

let adminAppPromise: Promise<any> | null = null;

/** Lazily initialise the Firebase Admin app (once). Never throws synchronously. */
async function getAdminAuth(): Promise<any> {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      const moduleName = 'firebase-admin/app';
      const authModuleName = 'firebase-admin/auth';
      const appMod: any = await import(/* @vite-ignore */ moduleName);
      const authMod: any = await import(/* @vite-ignore */ authModuleName);
      // Reuse an existing app if already initialised, else init from ADC.
      const existing = appMod.getApps?.() ?? [];
      const app =
        existing.length > 0
          ? existing[0]
          : appMod.initializeApp(
              config.firebaseProjectId ? { projectId: config.firebaseProjectId } : undefined,
            );
      return authMod.getAuth(app);
    })();
  }
  return adminAppPromise;
}

/** Extract a Bearer token from the Authorization header. */
export function bearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}

/**
 * Verify a Firebase ID token and authorize it against the shopkeeper allowlist
 * or a `shopkeeper` custom claim. Email is taken from the VERIFIED token only —
 * never from a client-supplied field.
 */
export async function verifyShopkeeper(idToken: string | null): Promise<AuthDecision> {
  if (!idToken) return { ok: false, status: 401, reason: 'missing_token' };
  let decoded: any;
  try {
    const auth = await getAdminAuth();
    decoded = await auth.verifyIdToken(idToken);
  } catch (err) {
    // Invalid/expired token, or Admin SDK unavailable. Treat as unauthenticated.
    return { ok: false, status: 401, reason: 'invalid_token' };
  }
  const email = (decoded.email ?? '').toString().toLowerCase();
  const emailVerified = decoded.email_verified === true;
  const hasClaim = decoded.shopkeeper === true || decoded.role === 'shopkeeper';
  const inAllowlist = Boolean(email) && emailVerified && config.shopkeeperAllowlist.includes(email);
  if (hasClaim || inAllowlist) {
    return { ok: true, email };
  }
  // Authenticated but NOT an authorized shopkeeper.
  return { ok: false, status: 403, email, reason: 'not_shopkeeper' };
}
