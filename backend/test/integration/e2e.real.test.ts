/**
 * REAL end-to-end test: Backend -> real Strands Agent -> real Document Engine.
 *
 * This exercises the actual services (including a real Bedrock call inside the
 * agent). It is GATED and SKIPS honestly unless:
 *   - RUN_E2E=1
 *   - the Backend can reach both the Strands Agent and the Document Engine
 * We never fake a successful real run.
 *
 * Prereqs to run:
 *   1) Document Engine on DOCUMENT_ENGINE_URL (default 5001)
 *   2) Strands Agent on STRANDS_AGENT_URL (default 4000) with AWS creds
 *   3) RUN_E2E=1
 *
 * Then:  RUN_E2E=1 npx tsx --test test/integration/e2e.real.test.ts
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { makeDocx } from '../helpers/docxFixture.js';

const enabled = process.env.RUN_E2E === '1';
let server: http.Server;
let base: string;
let reachable = false;

before(async () => {
  process.env.STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'printx-e2e-'));
  const { default: app } = await import('../../src/app.js');
  await new Promise<void>((resolve) => (server = app.listen(0, '127.0.0.1', resolve)));
  const addr = server.address();
  if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`;

  if (enabled) {
    const res = await fetch(`${base}/api/health`);
    const body = (await res.json()) as any;
    reachable = body?.dependencies?.strandsAgentReachable && body?.dependencies?.documentEngineReachable;
    if (!reachable) {
      console.warn('\n[SKIP] Real E2E: agent and/or engine not reachable.\n');
    }
  } else {
    console.warn('\n[SKIP] Real E2E disabled. Set RUN_E2E=1 with services + AWS creds running.\n');
  }
});

after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

async function upload(instruction: string): Promise<any> {
  const form = new FormData();
  const buf = await makeDocx('Author: Md Danish Ali', 'Report by Md Danish Ali.');
  form.set('file', new Blob([new Uint8Array(buf)]), 'report.docx');
  form.set('instruction', instruction);
  const res = await fetch(`${base}/api/jobs`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

test('REAL E2E: replace + set copies, preview & download real output', async (t) => {
  if (!enabled || !reachable) return t.skip('real services unavailable');

  const { status, body } = await upload('Replace Md Danish Ali with Omkar L Kulkarni and set copies to 3.');
  assert.equal(status, 201);
  assert.equal(body.job.status, 'READY_FOR_PREVIEW');
  assert.equal(body.job.copies, 3, 'copies metadata must be 3');

  const id = body.job.id;
  const dl = await fetch(`${base}/api/jobs/${id}/download`);
  assert.equal(dl.status, 200);
  const bytes = Buffer.from(await dl.arrayBuffer());
  assert.ok(bytes.length > 0, 'download returns real bytes');
});

test('REAL E2E: ambiguous instruction returns clarification', async (t) => {
  if (!enabled || !reachable) return t.skip('real services unavailable');
  const form = new FormData();
  const buf = await makeDocx('Attendees: John Smith, John Doe, Jane Roe.');
  form.set('file', new Blob([new Uint8Array(buf)]), 'a.docx');
  form.set('instruction', 'Change the name.');
  const res = await fetch(`${base}/api/jobs`, { method: 'POST', body: form });
  const body = (await res.json()) as any;
  assert.equal(body.job.status, 'NEEDS_CLARIFICATION');
});

test('REAL E2E: text-not-found is reported (no silent no-op)', async (t) => {
  if (!enabled || !reachable) return t.skip('real services unavailable');
  const { body } = await upload('Replace DOES_NOT_EXIST_XYZ with Test.');
  // Either the agent asks for clarification/explains, or it executes with zero
  // replacements. Both are honest; a silent success with changes is not.
  if (body.job.status === 'READY_FOR_PREVIEW') {
    const changes = body.job.changeSummary as any;
    assert.equal(changes.total_replacements, 0, 'no replacements should have occurred');
  } else {
    assert.equal(body.job.status, 'NEEDS_CLARIFICATION');
  }
});
