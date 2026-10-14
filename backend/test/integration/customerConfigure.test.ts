/**
 * Proves the authorization split that fixes the customer "Send to print shop"
 * 401: configure-printer is PUBLIC (customer verifies settings + hands the job
 * to the shop), while submit-print / delete stay shopkeeper-only.
 *
 * Runs with AUTH_MODE=token so the shopkeeper gate is ACTIVE — if
 * configure-printer were still gated it would 401 here.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { startStubs, type StubHandles } from '../helpers/stubServers.js';
import { makeDocx } from '../helpers/docxFixture.js';

let stubs: StubHandles;
let server: http.Server;
let base: string;

before(async () => {
  stubs = await startStubs();
  process.env.STRANDS_AGENT_URL = stubs.agentUrl;
  process.env.DOCUMENT_ENGINE_URL = stubs.engineUrl;
  process.env.STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'printx-cust-'));
  process.env.CORS_ORIGIN = '*';
  // Shopkeeper gate ACTIVE via a shared token (so we can prove which endpoints
  // require it and which do not).
  process.env.AUTH_MODE = 'token';
  process.env.SHOPKEEPER_API_TOKEN = 'shop-secret';
  process.env.DEFAULT_PRINTER_MODE = 'demo';

  const { default: app } = await import('../../src/app.js');
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address();
  if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await stubs.close();
  delete process.env.AUTH_MODE;
  delete process.env.SHOPKEEPER_API_TOKEN;
  delete process.env.DEFAULT_PRINTER_MODE;
});

test('customer (no shopkeeper token) can approve + configure-printer; submit-print stays gated', async () => {
  stubs.setAgentMode({
    kind: 'execute',
    copies: 3,
    replacements: 1,
    printOptions: { copies: 3, colorMode: 'monochrome', paperSize: 'A4', orientation: 'portrait', sides: 'two-sided-long-edge' },
  });

  // Customer upload + edit (public).
  const form = new FormData();
  const buf = await makeDocx('Rahul Kumar');
  form.set('file', new Blob([new Uint8Array(buf)]), 'd.docx');
  form.set('instruction', 'Replace Rahul Kumar with MD Danish Ali. 3 copies, B&W, A4, portrait, double-sided.');
  const created = await (await fetch(`${base}/api/jobs`, { method: 'POST', body: form })).json() as any;
  const jobId = created.job.id;
  assert.equal(created.job.status, 'READY_FOR_PREVIEW');

  // Customer approve (public).
  const appr = await fetch(`${base}/api/jobs/${jobId}/approve`, { method: 'POST' });
  assert.equal(appr.status, 200);

  // Customer configure-printer WITHOUT a shopkeeper token -> must succeed now.
  const cfg = await fetch(`${base}/api/jobs/${jobId}/configure-printer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: { copies: 3, colorMode: 'monochrome', paperSize: 'A4', orientation: 'portrait', sides: 'two-sided-long-edge' },
    }),
  });
  assert.equal(cfg.status, 200, 'configure-printer is public (customer hand-off)');
  const cfgJob = (await cfg.json()).job;
  assert.equal(cfgJob.status, 'READY_FOR_APPROVAL');
  assert.equal(cfgJob.printerMode, 'demo');
  assert.equal(cfgJob.printSettings.copies, 3);
  assert.equal(cfgJob.printSettings.sides, 'two-sided-long-edge');

  // submit-print WITHOUT a token -> still 401 (shop-only, hardware action).
  const noTok = await fetch(`${base}/api/jobs/${jobId}/submit-print`, { method: 'POST' });
  assert.equal(noTok.status, 401, 'submit-print remains shopkeeper-gated');

  // submit-print WITH the shopkeeper token -> succeeds (demo print).
  const withTok = await fetch(`${base}/api/jobs/${jobId}/submit-print`, {
    method: 'POST',
    headers: { 'x-shopkeeper-token': 'shop-secret' },
  });
  assert.equal(withTok.status, 200);
  assert.equal((await withTok.json()).job.status, 'PRINT_SUBMITTED');
});
