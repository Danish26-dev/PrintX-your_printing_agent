/**
 * Unit tests for the shopkeeper auth guard. Deterministic, dependency-free:
 *   - 'token' mode: 401 without a matching token, pass with it (set once at the
 *     top so the config singleton reads a stable value).
 *   - verifyShopkeeper(null) -> 401 (missing token) without the Admin SDK.
 *   - bearerToken header parsing (pure).
 * The live Firebase verifyIdToken path is exercised against real Firebase in
 * deployment, not faked here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set a stable token-mode config BEFORE importing anything that reads config.
process.env.AUTH_MODE = 'token';
process.env.SHOPKEEPER_API_TOKEN = 'secret-xyz';

const { requireShopkeeper } = await import('../../src/middleware/requireShopkeeper.js');
const { verifyShopkeeper, bearerToken } = await import('../../src/auth/firebaseAdmin.js');

function makeReq(headers: Record<string, string> = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { get: (h: string) => lower[h.toLowerCase()] } as any;
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  return res;
}

test('token mode: 401 without a matching token', async () => {
  const res = makeRes();
  let called = false;
  await requireShopkeeper(makeReq(), res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'SHOPKEEPER_UNAUTHORIZED');
});

test('token mode: 401 with a WRONG token', async () => {
  const res = makeRes();
  let called = false;
  await requireShopkeeper(makeReq({ 'x-shopkeeper-token': 'wrong' }), res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('token mode: passes with the matching token', async () => {
  const res = makeRes();
  let called = false;
  await requireShopkeeper(makeReq({ 'x-shopkeeper-token': 'secret-xyz' }), res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('verifyShopkeeper(null) -> 401 (missing token), no SDK required', async () => {
  const decision = await verifyShopkeeper(null);
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 401);
  assert.equal(decision.reason, 'missing_token');
});

test('bearerToken parses the Authorization header', () => {
  assert.equal(bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(bearerToken('bearer   token123  '), 'token123');
  assert.equal(bearerToken('Basic xyz'), null);
  assert.equal(bearerToken(undefined), null);
});
