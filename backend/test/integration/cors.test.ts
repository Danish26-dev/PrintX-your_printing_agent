/**
 * CORS allowlist tests. A Cloud Run service is reachable at MULTIPLE hostnames,
 * so the backend must accept EACH configured frontend origin and reflect the
 * matching one back. This guards against the regression where only one of the
 * two Cloud Run frontend URLs was allowed and the other was blocked.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const A = 'https://printx-frontend-g4agh2djwq-el.a.run.app';
const B = 'https://printx-frontend-285454445619.asia-south1.run.app';

let server: http.Server;
let base: string;

before(async () => {
  // Two allowed origins (comma-separated), auth disabled for the test.
  process.env.CORS_ORIGIN = `${A},${B}`;
  process.env.AUTH_MODE = 'none';
  const { default: app } = await import('../../src/app.js');
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address();
  if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test('reflects the FIRST allowed origin', async () => {
  const res = await fetch(`${base}/api/printers`, { headers: { Origin: A } });
  assert.equal(res.headers.get('access-control-allow-origin'), A);
});

test('reflects the SECOND allowed origin (the one that was being blocked)', async () => {
  const res = await fetch(`${base}/api/printers`, { headers: { Origin: B } });
  assert.equal(res.headers.get('access-control-allow-origin'), B);
});

test('does NOT allow an unlisted origin', async () => {
  const res = await fetch(`${base}/api/printers`, { headers: { Origin: 'https://evil.example.com' } });
  // cors() omits the allow-origin header for a disallowed origin.
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('a preflight (OPTIONS) for an allowed origin succeeds', async () => {
  const res = await fetch(`${base}/api/shop/jobs`, {
    method: 'OPTIONS',
    headers: {
      Origin: B,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  assert.ok(res.status === 204 || res.status === 200);
  assert.equal(res.headers.get('access-control-allow-origin'), B);
});
