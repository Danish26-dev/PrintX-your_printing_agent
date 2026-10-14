/**
 * End-to-end DEMO print flow over the real Backend Express app, with the agent
 * + document engine stubbed. Proves the hardware-free demo works through ONE
 * canonical job id:
 *
 *   upload+edit -> READY_FOR_PREVIEW
 *   approve     -> APPROVED
 *   configure   -> READY_FOR_APPROVAL on a DEMO printer (no explicit mode, no
 *                  device selected) because DEFAULT_PRINTER_MODE=demo
 *   submit      -> PRINT_SUBMITTED (simulated; never claims physical paper)
 *
 * It also asserts the exact print configuration from the customer instruction
 * (3 / monochrome / A4 / portrait / double-sided) lands on the job + is served
 * by the shop feed, and that NO duplicate job is created along the way.
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
  process.env.STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'printx-demo-'));
  process.env.CORS_ORIGIN = '*';
  process.env.AUTH_MODE = 'none';
  // THE DEMO SWITCH: with no physical agent and no shopkeeper-selected device,
  // a configure request defaults to the simulated demo adapter instead of
  // failing with NO_PRINTER.
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
  delete process.env.DEFAULT_PRINTER_MODE;
});

test('DEMO E2E: Rahul Kumar -> MD Danish Ali, then 3/BW/A4/portrait/double-sided demo print (one job id)', async () => {
  stubs.setAgentMode({
    kind: 'execute',
    copies: 3,
    replacements: 2,
    printOptions: {
      copies: 3,
      colorMode: 'monochrome',
      paperSize: 'A4',
      orientation: 'portrait',
      sides: 'two-sided-long-edge',
    },
  });

  // 1. Customer upload + edit instruction (single call) -> READY_FOR_PREVIEW.
  const form = new FormData();
  const buf = await makeDocx('Rahul Kumar');
  form.set('file', new Blob([new Uint8Array(buf)]), 'contract.docx');
  form.set(
    'instruction',
    'Replace Rahul Kumar with MD Danish Ali throughout. 3 copies, black and white, A4, portrait, double-sided.',
  );
  const created = await (await fetch(`${base}/api/jobs`, { method: 'POST', body: form })).json() as any;
  const jobId = created.job.id;
  assert.equal(created.job.status, 'READY_FOR_PREVIEW');
  assert.equal(created.job.shopId, 'printx-lab', 'job associated with PrintX Lab');
  assert.deepEqual(created.job.proposedPrintSettings, {
    copies: 3,
    colorMode: 'monochrome',
    paperSize: 'A4',
    orientation: 'portrait',
    sides: 'two-sided-long-edge',
  });

  // 2. Customer "OK PRINT": approve + configure. NO explicit mode and NO
  //    printerId -> resolves to the DEMO adapter via DEFAULT_PRINTER_MODE.
  const approved = await (await fetch(`${base}/api/jobs/${jobId}/approve`, { method: 'POST' })).json() as any;
  assert.equal(approved.job.status, 'APPROVED');
  assert.equal(approved.job.id, jobId, 'same canonical job id');

  const cfg = await (await fetch(`${base}/api/jobs/${jobId}/configure-printer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: {
        copies: 3,
        colorMode: 'monochrome',
        paperSize: 'A4',
        orientation: 'portrait',
        sides: 'two-sided-long-edge',
      },
      // No `mode` on purpose — demo default must kick in.
    }),
  })).json() as any;

  assert.equal(cfg.job.id, jobId, 'configure keeps the same job id (no duplicate)');
  assert.equal(cfg.job.status, 'READY_FOR_APPROVAL', 'configured against the demo printer');
  assert.equal(cfg.job.printerMode, 'demo', 'resolved to the demo adapter');
  // Exact configuration verified and applied.
  assert.equal(cfg.job.printSettings.copies, 3);
  assert.equal(cfg.job.printSettings.colorMode, 'monochrome');
  assert.equal(cfg.job.printSettings.paperSize, 'A4');
  assert.equal(cfg.job.printSettings.orientation, 'portrait');
  assert.equal(cfg.job.printSettings.sides, 'two-sided-long-edge');
  // Real demo lifecycle events drive the cursor.
  const types = cfg.job.events.map((e: any) => e.type);
  assert.ok(types.includes('CHECKING_PRINTERS'));
  assert.ok(types.filter((t: string) => t === 'SETTING_APPLIED').length >= 5);
  assert.ok(types.includes('CONFIGURATION_VERIFIED'));

  // 3. The shop feed shows this one job for PrintX Lab.
  const feed = await (await fetch(`${base}/api/shop/jobs`)).json() as any;
  assert.equal(feed.shopId, 'printx-lab');
  const row = feed.jobs.find((j: any) => j.id === jobId);
  assert.ok(row, 'the job appears on the PrintX Lab shop feed');
  assert.equal(row.status, 'READY_FOR_APPROVAL');

  // 4. Shopkeeper submits the demo print -> PRINT_SUBMITTED (never PRINTED).
  const sub = await (await fetch(`${base}/api/jobs/${jobId}/submit-print`, { method: 'POST' })).json() as any;
  assert.equal(sub.job.id, jobId);
  assert.equal(sub.job.status, 'PRINT_SUBMITTED');
  assert.notEqual(sub.job.status, 'PRINTED');

  // 5. Still exactly ONE job for the shop (no duplicates created anywhere).
  const feed2 = await (await fetch(`${base}/api/shop/jobs`)).json() as any;
  assert.equal(feed2.jobs.filter((j: any) => j.id === jobId).length, 1);
});

test('DEMO: Test Agent Configuration returns ordered steps for the cursor (demo adapter)', async () => {
  const result = await (await fetch(`${base}/api/printers/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'demo' }),
  })).json() as any;
  assert.equal(result.ok, true);
  assert.equal(result.isDemo, true);
  assert.ok(Array.isArray(result.steps) && result.steps.length >= 6, 'ordered steps drive the cursor');
  // The steps include the real applied fields the cursor animates over.
  const fields = result.steps.map((s: any) => s.field);
  for (const f of ['printer', 'copies', 'color', 'paper', 'layout', 'sides']) {
    assert.ok(fields.includes(f), `step for ${f} present`);
  }
});

test('DEMO: /api/printers always exposes the two demo printers without a local agent', async () => {
  const data = await (await fetch(`${base}/api/printers`)).json() as any;
  assert.equal(Array.isArray(data.demoPrinters), true);
  assert.equal(data.demoPrinters.length, 2, 'two selectable demo printers');
  for (const d of data.demoPrinters) {
    assert.equal(d.isDemo, true);
    assert.equal(d.status, 'online');
  }
});
