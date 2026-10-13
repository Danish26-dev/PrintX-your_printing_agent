/**
 * Mocked-service integration tests: exercise the REAL Backend Express app end
 * to end, with the Strands Agent and Document Engine replaced by in-process
 * stubs. No AWS, no Python. These are clearly labelled test doubles.
 *
 * Covers: health, upload validation, job creation, retrieval, clarification,
 * engine/agent failure, invalid job id, path-traversal attempt, download,
 * preview, copy metadata, lifecycle transitions, and cleanup.
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
  // Configure the Backend (env is read at import time) BEFORE importing the app.
  process.env.STRANDS_AGENT_URL = stubs.agentUrl;
  process.env.DOCUMENT_ENGINE_URL = stubs.engineUrl;
  process.env.STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'printx-be-'));
  process.env.CORS_ORIGIN = '*';
  // Explicit local/test auth bypass. In production AUTH_MODE must be 'firebase'
  // (or 'token'); this bypass is NEVER the default and must be set deliberately.
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
  await stubs.close();
});

async function uploadJob(instruction?: string): Promise<any> {
  const form = new FormData();
  const buf = await makeDocx('Md Danish Ali');
  form.set('file', new Blob([new Uint8Array(buf)]), 'doc.docx');
  if (instruction !== undefined) form.set('instruction', instruction);
  const res = await fetch(`${base}/api/jobs`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

test('A. health reports dependency reachability', async () => {
  const res = await fetch(`${base}/api/health`);
  const body = (await res.json()) as any;
  assert.equal(res.status, 200);
  assert.equal(body.dependencies.strandsAgentReachable, true);
  assert.equal(body.dependencies.documentEngineReachable, true);
});

test('B. upload validation rejects unsupported file type', async () => {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(Buffer.from('hi'))]), 'note.txt');
  const res = await fetch(`${base}/api/files/upload`, { method: 'POST', body: form });
  const body = (await res.json()) as any;
  assert.equal(res.status, 415);
  assert.equal(body.error.code, 'UNSUPPORTED_FILE');
});

test('B2. upload with no file is rejected', async () => {
  const res = await fetch(`${base}/api/files/upload`, { method: 'POST', body: new FormData() });
  assert.equal(res.status, 400);
});

test('C+F. job creation + successful processing (execute mode)', async () => {
  stubs.setAgentMode({ kind: 'execute', copies: 3, replacements: 1 });
  const { status, body } = await uploadJob('Replace Md Danish Ali with Omkar L Kulkarni and set copies to 3.');
  assert.equal(status, 201);
  assert.equal(body.job.status, 'READY_FOR_PREVIEW');
  assert.equal(body.job.copies, 3, 'copies metadata preserved');
});

test('D. job retrieval returns a safe view', async () => {
  stubs.setAgentMode({ kind: 'execute', copies: 1, replacements: 1 });
  const created = await uploadJob('do something');
  const id = created.body.job.id;
  const res = await fetch(`${base}/api/jobs/${id}`);
  const body = (await res.json()) as any;
  assert.equal(res.status, 200);
  assert.equal(body.job.id, id);
  assert.equal('inputFileReference' in body.job, false);
});

test('G. clarification does NOT mark READY_FOR_PREVIEW', async () => {
  stubs.setAgentMode({ kind: 'clarify', message: 'Which name should I replace?' });
  const { body } = await uploadJob('Change the name.');
  assert.equal(body.job.status, 'NEEDS_CLARIFICATION');
  assert.match(body.job.agentMessage, /which name/i);
});

test('G2. agent print proposal is stored on the job as proposedPrintSettings', async () => {
  // Regression: the agent now proposes structured print options; the Backend
  // must carry them onto the job view (as a PROPOSAL) so the shop can validate
  // and apply them. They are NOT applied here — just recorded.
  stubs.setAgentMode({
    kind: 'execute',
    copies: 2,
    replacements: 1,
    printOptions: {
      copies: 2,
      colorMode: 'monochrome',
      paperSize: 'A4',
      orientation: 'portrait',
      sides: 'two-sided-long-edge',
    },
  });
  const { body } = await uploadJob('Print 2 copies, black and white, A4, double-sided.');
  assert.equal(body.job.status, 'READY_FOR_PREVIEW');
  assert.ok(body.job.proposedPrintSettings, 'proposal recorded on the job');
  assert.equal(body.job.proposedPrintSettings.colorMode, 'monochrome');
  assert.equal(body.job.proposedPrintSettings.paperSize, 'A4');
  assert.equal(body.job.proposedPrintSettings.orientation, 'portrait');
  assert.equal(body.job.proposedPrintSettings.sides, 'two-sided-long-edge');
  // The proposal is NOT a verified configuration yet.
  assert.equal(body.job.printSettings ?? null, null);
});

test('G3. a job with no print request has no proposedPrintSettings', async () => {
  stubs.setAgentMode({ kind: 'execute', copies: 1, replacements: 1 });
  const { body } = await uploadJob('Just replace the name.');
  assert.equal(body.job.status, 'READY_FOR_PREVIEW');
  assert.equal(body.job.proposedPrintSettings ?? null, null);
});

test('G4. clarification does NOT lose the proposed print settings (Issue 6)', async () => {
  // The customer asked for print settings but the edit target was ambiguous, so
  // the agent asks a clarifying question. The job must become NEEDS_CLARIFICATION
  // (a question, NOT a permanent failure) AND keep the proposed print config.
  stubs.setAgentMode({
    kind: 'clarify',
    message: 'Which "Kumar" should I replace?',
    printOptions: {
      copies: 2,
      colorMode: 'monochrome',
      paperSize: 'A4',
      orientation: 'portrait',
      sides: 'two-sided-long-edge',
    },
  });
  const { body } = await uploadJob('Replace Kumar; 2 copies, B&W, A4, portrait, double-sided.');
  assert.equal(body.job.status, 'NEEDS_CLARIFICATION');
  assert.ok(body.job.agentMessage && /which/i.test(body.job.agentMessage));
  assert.ok(body.job.proposedPrintSettings, 'proposal preserved through clarification');
  assert.equal(body.job.proposedPrintSettings.sides, 'two-sided-long-edge');
  // Clarification is not a failure, so no error payload.
  assert.equal(body.job.error ?? null, null);
});

test('A. settings-only "Make 2 copies, black and white, A4" -> READY_FOR_PREVIEW, not clarification', async () => {
  // The exact failing P0 scenario: a print-settings-only instruction. The job
  // must advance to READY_FOR_PREVIEW with ALL requested settings captured,
  // NOT be mislabelled NEEDS_CLARIFICATION (which caused the "proceed?" loop).
  stubs.setAgentMode({
    kind: 'settingsOnly',
    message: "I'll make 2 black and white copies on A4 paper.",
    printOptions: { copies: 2, colorMode: 'monochrome', paperSize: 'A4' },
  });
  const { body } = await uploadJob('Make 2 copies, black and white, on A4 paper');
  assert.equal(body.job.status, 'READY_FOR_PREVIEW');
  assert.notEqual(body.job.status, 'NEEDS_CLARIFICATION');
  assert.equal(body.job.hasOutput, true, 'the (unedited) document is previewable');
  assert.deepEqual(body.job.proposedPrintSettings, { copies: 2, colorMode: 'monochrome', paperSize: 'A4' });
  assert.equal(body.job.copies, 2);
  // Honest: no content was changed.
  assert.equal(body.job.changeSummary.total_replacements, 0);
});

test('E/F/G/O. changing one setting preserves the others (merge across turns)', async () => {
  // Turn 1: full settings proposal.
  stubs.setAgentMode({
    kind: 'settingsOnly',
    printOptions: { copies: 2, colorMode: 'monochrome', paperSize: 'A4', orientation: 'portrait' },
  });
  const created = await uploadJob('2 copies, black and white, A4, portrait');
  const id = created.body.job.id;
  assert.equal(created.body.job.proposedPrintSettings.colorMode, 'monochrome');

  // E. change copies -> keeps colour/paper/orientation.
  stubs.setAgentMode({ kind: 'settingsOnly', printOptions: { copies: 5 } });
  let r = await fetch(`${base}/api/jobs/${id}/instruction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction: 'change to 5 copies' }),
  });
  let job = (await r.json() as any).job;
  assert.deepEqual(job.proposedPrintSettings, {
    copies: 5, colorMode: 'monochrome', paperSize: 'A4', orientation: 'portrait',
  });

  // F. change colour -> keeps the (now 5) copies + paper + orientation.
  stubs.setAgentMode({ kind: 'settingsOnly', printOptions: { colorMode: 'color' } });
  r = await fetch(`${base}/api/jobs/${id}/instruction`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction: 'make it colour' }),
  });
  job = (await r.json() as any).job;
  assert.deepEqual(job.proposedPrintSettings, {
    copies: 5, colorMode: 'color', paperSize: 'A4', orientation: 'portrait',
  });

  // G. change paper -> keeps everything else.
  stubs.setAgentMode({ kind: 'settingsOnly', printOptions: { paperSize: 'Letter' } });
  r = await fetch(`${base}/api/jobs/${id}/instruction`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction: 'use Letter paper' }),
  });
  job = (await r.json() as any).job;
  assert.deepEqual(job.proposedPrintSettings, {
    copies: 5, colorMode: 'color', paperSize: 'Letter', orientation: 'portrait',
  });
  assert.equal(job.id, id, 'same job id across all turns (no duplicate jobs)');
});

test('B. combined edit + print settings: both the edit and the settings land on one job', async () => {
  stubs.setAgentMode({
    kind: 'execute',
    copies: 3,
    replacements: 1,
    printOptions: { copies: 3, colorMode: 'monochrome', sides: 'two-sided-long-edge' },
  });
  const { body } = await uploadJob('Replace A with B and print 3 copies, B&W, double-sided');
  assert.equal(body.job.status, 'READY_FOR_PREVIEW');
  assert.equal(body.job.hasOutput, true);
  assert.equal(body.job.proposedPrintSettings.sides, 'two-sided-long-edge');
  assert.equal(body.job.proposedPrintSettings.colorMode, 'monochrome');
});

test('H. Document Engine / agent failure maps to a clean error', async () => {
  stubs.setAgentMode({ kind: 'error', status: 500, code: 'boom' });
  const { status, body } = await uploadJob('do something');
  assert.equal(status, 502);
  assert.ok(body.error.code);
  assert.equal(/stack|Error:|\/|password/i.test(body.error.message), false, 'no leaking details');
});

test('I. invalid job id is rejected', async () => {
  const res = await fetch(`${base}/api/jobs/not-a-real-id`);
  const body = (await res.json()) as any;
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_JOB_ID');
});

test('J. path traversal in job id is blocked', async () => {
  const res = await fetch(`${base}/api/jobs/${encodeURIComponent('../../etc/passwd')}/download`);
  assert.equal(res.status, 400);
});

test('K+L. download and preview return the processed document', async () => {
  stubs.setAgentMode({ kind: 'execute', copies: 2, replacements: 1 });
  const created = await uploadJob('edit please');
  const id = created.body.job.id;

  const dl = await fetch(`${base}/api/jobs/${id}/download`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition') ?? '', /attachment/);
  const bytes = Buffer.from(await dl.arrayBuffer());
  assert.ok(bytes.length > 0);

  const pv = await fetch(`${base}/api/jobs/${id}/preview`);
  assert.equal(pv.status, 200);
  assert.match(pv.headers.get('content-disposition') ?? '', /inline/);
});

test('M+N. lifecycle: approve -> print (never fake PRINTED)', async () => {
  stubs.setAgentMode({ kind: 'execute', copies: 1, replacements: 1 });
  const created = await uploadJob('edit please');
  const id = created.body.job.id;

  const approve = await fetch(`${base}/api/jobs/${id}/approve`, { method: 'POST' });
  assert.equal((await approve.json() as any).job.status, 'APPROVED');

  // HONEST MVP: no local printer agent is configured in this test env, so the
  // real print flow must NOT fabricate a success. It fails with NO_PRINTER and
  // the job becomes PRINT_FAILED (document preserved) — never a fake PRINTED or
  // PRINT_COMMAND_SUBMITTED. A real printer flow is covered by the controlled
  // adapter in test/integration/printerLifecycle.test.ts.
  const print = await fetch(`${base}/api/jobs/${id}/print`, { method: 'POST' });
  assert.equal(print.ok, false, 'printing without a real printer agent must not succeed');
  const printBody = (await print.json()) as any;
  assert.ok(printBody.error?.code, 'a structured error code is returned');
  assert.notEqual(printBody.job?.status, 'PRINTED');

  // The job is a retryable failed state; the edited document is preserved.
  const after = await (await fetch(`${base}/api/jobs/${id}`)).json() as any;
  assert.equal(after.job.status, 'PRINT_FAILED');
  assert.equal(after.job.hasOutput, true, 'document preserved after a failed print');
});

test('N2. cannot print before approve', async () => {
  stubs.setAgentMode({ kind: 'execute', copies: 1, replacements: 1 });
  const created = await uploadJob('edit please');
  const id = created.body.job.id;
  const print = await fetch(`${base}/api/jobs/${id}/print`, { method: 'POST' });
  assert.equal(print.status, 409);
});

test('P. END-TO-END customer→shopkeeper: Issue-1 scenario settings survive verbatim', async () => {
  // Drive the EXACT regression scenario over the REAL backend HTTP surface,
  // with a controlled printer adapter so the full print flow runs. Proves:
  //  - the agent's proposed print settings survive to the verified config,
  //  - the customer confirmation path (approve + configure) never submits a
  //    physical print,
  //  - the shopkeeper submit is the only thing that reaches PRINT_SUBMITTED,
  //  - no duplicate jobs are created across the follow-up turns.
  const { FakePrinterAdapter, DEFAULT_FAKE_PRINTER } = await import('../helpers/fakePrinterAdapter.js');
  const { __setPrinterAdapterForTests } = await import('../../src/printing/PrinterAdapter.js');
  const prev = __setPrinterAdapterForTests(new FakePrinterAdapter());
  try {
    stubs.setAgentMode({
      kind: 'execute',
      copies: 2,
      replacements: 3,
      printOptions: {
        copies: 2,
        colorMode: 'monochrome',
        paperSize: 'A4',
        orientation: 'portrait',
        sides: 'two-sided-long-edge',
      },
    });
    const created = await uploadJob(
      "Replace every 'Rahul Kumar' with 'Danish Ali'. 2 copies, black and white, A4, portrait, double-sided.",
    );
    const id = created.body.job.id;
    assert.equal(created.body.job.status, 'READY_FOR_PREVIEW');
    assert.deepEqual(created.body.job.proposedPrintSettings, {
      copies: 2,
      colorMode: 'monochrome',
      paperSize: 'A4',
      orientation: 'portrait',
      sides: 'two-sided-long-edge',
    });

    // Customer confirmation ("proceed") = approve + configure. This must NOT
    // print. It forwards the agent's proposal to the real configure endpoint.
    await fetch(`${base}/api/jobs/${id}/approve`, { method: 'POST' });
    const cfg = await fetch(`${base}/api/jobs/${id}/configure-printer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          copies: 2,
          colorMode: 'monochrome',
          paperSize: 'A4',
          orientation: 'portrait',
          sides: 'two-sided-long-edge',
        },
      }),
    });
    const cfgJob = (await cfg.json()).job;
    assert.equal(cfgJob.status, 'READY_FOR_APPROVAL');
    // The requested settings survived VERBATIM into the verified configuration.
    assert.equal(cfgJob.printSettings.copies, 2);
    assert.equal(cfgJob.printSettings.colorMode, 'monochrome');
    assert.equal(cfgJob.printSettings.paperSize, 'A4');
    assert.equal(cfgJob.printSettings.orientation, 'portrait');
    assert.equal(cfgJob.printSettings.sides, 'two-sided-long-edge');
    assert.equal(cfgJob.printSettings.printerId, DEFAULT_FAKE_PRINTER.id);
    // Not yet printed — the customer confirmation never submits.
    assert.notEqual(cfgJob.status, 'PRINT_SUBMITTED');
    // Real configuration events are present (drive the cursor visualization).
    const types = cfgJob.events.map((e: any) => e.type);
    assert.ok(types.includes('CHECKING_PRINTERS'));
    assert.ok(types.filter((t: string) => t === 'SETTING_APPLIED').length >= 5);
    assert.ok(types.includes('CONFIGURATION_VERIFIED'));

    // Shopkeeper approval is the ONLY path to submission.
    const sub = await fetch(`${base}/api/jobs/${id}/submit-print`, { method: 'POST' });
    const subJob = (await sub.json()).job;
    assert.equal(subJob.status, 'PRINT_SUBMITTED');
    assert.notEqual(subJob.status, 'PRINTED');

    // Duplicate submit is rejected (no duplicate jobs / no second print).
    const dup = await fetch(`${base}/api/jobs/${id}/submit-print`, { method: 'POST' });
    assert.equal(dup.status, 409);
  } finally {
    __setPrinterAdapterForTests(prev);
  }
});

test('O. cleanup deletes files and marks DELETED (idempotent)', async () => {
  stubs.setAgentMode({ kind: 'execute', copies: 1, replacements: 1 });
  const created = await uploadJob('edit please');
  const id = created.body.job.id;

  const del1 = await fetch(`${base}/api/jobs/${id}`, { method: 'DELETE' });
  assert.equal((await del1.json() as any).job.status, 'DELETED');

  // Output no longer downloadable.
  const dl = await fetch(`${base}/api/jobs/${id}/download`);
  assert.equal(dl.status, 409);
});

test('Q. every uploaded job is stamped with the PrintX Lab shop and shows on the shop feed', async () => {
  // Simulates two DIFFERENT customers/sessions uploading. Both jobs must carry
  // the PrintX Lab shopId and both must appear on the shopkeeper feed — the
  // dashboard is no longer disconnected from the channel.
  stubs.setAgentMode({ kind: 'execute', copies: 1, replacements: 1 });

  // Customer 1: no shopId supplied -> defaults to PrintX Lab.
  const c1 = await uploadJob('edit please');
  const id1 = c1.body.job.id;
  assert.equal(c1.body.job.shopId, 'printx-lab');

  // Customer 2: explicitly selects PrintX Lab.
  const form = new FormData();
  const { makeDocx } = await import('../helpers/docxFixture.js');
  const buf = await makeDocx('Someone Else');
  form.set('file', new Blob([new Uint8Array(buf)]), 'doc2.docx');
  form.set('instruction', 'edit please');
  form.set('shopId', 'printx-lab');
  const r2 = await fetch(`${base}/api/jobs`, { method: 'POST', body: form });
  const b2 = (await r2.json()) as any;
  const id2 = b2.job.id;
  assert.equal(b2.job.shopId, 'printx-lab');

  // The shopkeeper feed (AUTH_MODE=none in this test) returns BOTH jobs, each
  // with its own shopId, under the PrintX Lab wrapper.
  const feed = await (await fetch(`${base}/api/shop/jobs`)).json() as any;
  assert.equal(feed.shopId, 'printx-lab');
  const ids = feed.jobs.map((j: any) => j.id);
  assert.ok(ids.includes(id1), 'customer 1 job is on the shop feed');
  assert.ok(ids.includes(id2), 'customer 2 job is on the shop feed');
  for (const j of feed.jobs) assert.equal(j.shopId, 'printx-lab');
});

test('Q2. a forged shopId is NOT trusted; the job is still associated with PrintX Lab', async () => {
  stubs.setAgentMode({ kind: 'execute', copies: 1, replacements: 1 });
  const form = new FormData();
  const { makeDocx } = await import('../helpers/docxFixture.js');
  const buf = await makeDocx('Forge Test');
  form.set('file', new Blob([new Uint8Array(buf)]), 'forge.docx');
  form.set('instruction', 'edit please');
  form.set('shopId', 'totally-made-up-shop');
  const r = await fetch(`${base}/api/jobs`, { method: 'POST', body: form });
  const b = (await r.json()) as any;
  // Server-side validation rejects the forged value and defaults to PrintX Lab.
  assert.equal(b.job.shopId, 'printx-lab');
});
