/**
 * Authorization guard for SHOPKEEPER-only endpoints (printer control, print
 * submission, approval, deletion, shop feeds). These must never be callable by
 * an anonymous customer.
 *
 * MODES (config.authMode, from AUTH_MODE — see config.ts):
 *   'firebase' (PRODUCTION): require a valid Firebase ID token in the
 *       `Authorization: Bearer <idToken>` header, verified by the Admin SDK,
 *       AND the caller must be an authorized shopkeeper (allowlisted verified
 *       email or a `shopkeeper` custom claim). 401 if missing/invalid token,
 *       403 if authenticated but not a shopkeeper.
 *   'token' (CI / simple hosted): a shared `x-shopkeeper-token` header must
 *       match SHOPKEEPER_API_TOKEN (constant-time compare), else 401.
 *   'none' (LOCAL DEV / TESTS ONLY): guard disabled. This is NEVER the implicit
 *       production default — it must be set explicitly, and we log a warning so
 *       it can't be shipped silently.
 *
 * Tokens/secrets are NEVER logged or returned in a response.
 */
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { bearerToken, verifyShopkeeper } from '../auth/firebaseAdmin.js';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

let warnedNone = false;

export async function requireShopkeeper(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  switch (config.authMode) {
    case 'none': {
      if (!warnedNone) {
        warnedNone = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[auth] AUTH_MODE=none — shopkeeper endpoints are UNGUARDED. ' +
            'This is for local dev/tests only; set AUTH_MODE=firebase in production.',
        );
      }
      next();
      return;
    }

    case 'token': {
      const expected = config.shopkeeperApiToken;
      if (!expected) {
        res.status(500).json({
          error: { code: 'AUTH_MISCONFIGURED', message: 'Shopkeeper auth is misconfigured.' },
        });
        return;
      }
      const provided = (req.get('x-shopkeeper-token') ?? '').trim();
      if (provided && safeEqual(provided, expected)) {
        next();
        return;
      }
      res.status(401).json({
        error: { code: 'SHOPKEEPER_UNAUTHORIZED', message: 'This action requires shopkeeper authorization.' },
      });
      return;
    }

    case 'firebase':
    default: {
      const decision = await verifyShopkeeper(bearerToken(req.get('authorization')));
      if (decision.ok) {
        // Attach the verified identity for any downstream use (never trusted
        // from the client).
        (req as Request & { shopkeeperEmail?: string }).shopkeeperEmail = decision.email;
        next();
        return;
      }
      if (decision.status === 403) {
        res.status(403).json({
          error: {
            code: 'SHOPKEEPER_FORBIDDEN',
            message: 'Your account is not authorized for shopkeeper access.',
          },
        });
        return;
      }
      res.status(401).json({
        error: {
          code: 'SHOPKEEPER_UNAUTHORIZED',
          message: 'This action requires shopkeeper sign-in.',
        },
      });
      return;
    }
  }
}
