/**
 * DETERMINISTIC PIPELINE TEST (NOT a Bedrock test).
 *
 * This proves the entire NON-LLM execution pipeline end to end using the REAL
 * Document Engine. The ONLY thing faked is the Bedrock boundary: a tiny stub
 * "agent" receives the Backend's /api/edit call and, instead of asking an LLM,
 * uses a FIXED OperationPlan (replace Rahul->Danish, copies=3). It forwards that
 * plan to the REAL Document Engine, which performs the deterministic edit.
 *
 * Flow proven:
 *   upload (real DOCX containing "Rahul")
 *     -> job created
 *     -> instruction -> stub agent injects fixture plan -> REAL engine edits
 *     -> backend stores + validates output
 *     -> READY_FOR_PREVIEW -> download real edited bytes (Rahul GONE, Danish present)
 *     -> approve -> print (PRINT_COMMAND_SUBMITTED, printConfig.copies=3)
 *     -> cleanup (DELETED), lifecycle events recorded
 *
 * Requires the REAL Document Engine running at DOC_ENGINE (default 5001).
 * Skips honestly (does NOT fake success) if the engine is unreachable.
 *
 * Run (engine up):  npx tsx --test test/integration/deterministic.e2e.test.ts
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import AdmZip from 'adm-zip';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const DOC_ENGINE = process.env.DOC_ENGINE_URL || 'http://127.0.0.1:5001';

let engineUp = false;
let agentServer: http.Server;
let backendServer: http.Server;
let base: string;

async function engineReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${DOC_ENGINE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stub agent that stands in for Strands+Bedrock. It injects a FIXED plan and
 * calls the REAL Document Engine /process, then returns the engine's result in
 * the shape the Backend expects.
 */
function startStubAgent(): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }
    if (req.url === '/api/edit' && req.method === 'POST') {
      // Collect the multipart body and forward the file to the real engine.
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(Buffer.from(c)));
      req.on('end', async () => {
        try {
          const raw = Buffer.concat(chunks);
          // Extract the uploaded file from the multipart payload (simple parse).
          const fileBuffer = extractFilePart(raw);
          // FIXTURE plan — this is the Bedrock-boundary substitution.
          const plan = {
            operations: [
              { type: 'replace_text', find: 'Rahul', replace: 'Danish' },
              { type: 'set_copies', copies: 3 },
            ],
          };
          const form = new FormData();
          form.set('file', new Blob([new Uint8Array(fileBuffer)]), 'input.docx');
          form.set('plan', JSON.stringify(plan));
          const engRes = await fetch(`${DOC_ENGINE}/process`, { method: 'POST', body: form });
          const engBody: any = await engRes.json();
          if (!engRes.ok) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: engBody.error ?? { code: 'engine_error' } }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              result: {
                executed: true,
                message: "I'll replace 'Rahul' with 'Danish' and prepare 3 copies.",
                plan,
                document: {
                  job_id: engBody.job_id,
                  input_format: engBody.input_format,
                  output_format: engBody.output_format,
                  output_filename: engBody.output_filename,
                  changes: engBody.changes,
                  download_url: engBody.download_url,
                },
              },
            }),
          );
        } catch (err: any) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'stub_agent_error', message: String(err?.message) } }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Minimal multipart extractor: returns the bytes of the "file" part. */
function extractFilePart(raw: Buffer): Buffer {
  // Find the boundary from the first line.
  const text = raw.toString('latin1');
  const boundaryMatch = text.match(/^(--[^\r\n]+)\r\n/);
  if (!boundaryMatch) return raw;
  const boundary = boundaryMatch[1];
  const parts = text.split(boundary);
  for (const part of parts) {
    if (/name="file"/.test(part)) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      let body = part.slice(headerEnd + 4);
      // Trim trailing CRLF before the next boundary.
      body = body.replace(/\r\n$/, '');
      return Buffer.from(body, 'latin1');
    }
  }
  return raw;
}

function port(server: http.Server): number {
  const a = server.address();
  if (a && typeof a === 'object') return a.port;
  throw new Error('no port');
}

before(async () => {
  engineUp = await engineReachable();
  if (!engineUp) {
    console.warn(`\n[SKIP] Deterministic E2E: Document Engine not reachable at ${DOC_ENGINE}.\n`);
    return;
  }
  agentServer = await startStubAgent();
  process.env.STRANDS_AGENT_URL = `http://127.0.0.1:${port(agentServer)}`;
  process.env.DOCUMENT_ENGINE_URL = DOC_ENGINE;
  process.env.STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'printx-det-'));

  const { default: app } = await import('../../src/app.js');
  await new Promise<void>((resolve) => (backendServer = app.listen(0, '127.0.0.1', resolve)));
  base = `http://127.0.0.1:${port(backendServer)}`;
});

after(async () => {
  if (backendServer) await new Promise<void>((r) => backendServer.close(() => r()));
  if (agentServer) await new Promise<void>((r) => agentServer.close(() => r()));
});

test('DETERMINISTIC PIPELINE: Rahul -> Danish + 3 copies, real engine edit', async (t) => {
  if (!engineUp) return t.skip('document engine unavailable');

  // Build a real DOCX containing Rahul (and unrelated content to confirm it survives).
  const doc = new Document({
    sections: [{ children: [
      new Paragraph({ children: [new TextRun('Student: Rahul')] }),
      new Paragraph({ children: [new TextRun('Course: Mathematics 101')] }),
      new Paragraph({ children: [new TextRun('Submitted by Rahul on Monday.')] }),
    ] }],
  });
  const buf = await Packer.toBuffer(doc);

  // 1. Upload + instruction (instruction text is irrelevant; stub injects plan).
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(buf)]), 'assignment.docx');
  form.set('instruction', 'Change Rahul to Danish and print 3 copies.');
  const createRes = await fetch(`${base}/api/jobs`, { method: 'POST', body: form });
  const created: any = await createRes.json();
  assert.equal(createRes.status, 201);
  const job = created.job;
  assert.equal(job.status, 'READY_FOR_PREVIEW', 'job should be ready after real edit');
  assert.equal(job.copies, 3, 'copies metadata should be 3');

  // Lifecycle events were recorded truthfully.
  const types = job.events.map((e: any) => e.type);
  for (const expected of ['CUSTOMER_SENT_JOB', 'DOCUMENT_EDIT_COMPLETED', 'PREVIEW_READY']) {
    assert.ok(types.includes(expected), `expected event ${expected}`);
  }

  // 2. Download the REAL edited document and verify the actual bytes.
  const dl = await fetch(`${base}/api/jobs/${job.id}/download`);
  assert.equal(dl.status, 200);
  const outBytes = Buffer.from(await dl.arrayBuffer());
  const xml = new AdmZip(outBytes).readAsText('word/document.xml') || '';
  const textOut = xml.replace(/<[^>]+>/g, '');
  assert.ok(!textOut.includes('Rahul'), 'Rahul should be gone');
  assert.ok(textOut.includes('Danish'), 'Danish should be present');
  assert.ok(textOut.includes('Mathematics 101'), 'unrelated content preserved');

  // 3. Approve -> print (honest PRINT_COMMAND_SUBMITTED + print config).
  const approve = await fetch(`${base}/api/jobs/${job.id}/approve`, { method: 'POST' });
  assert.equal((await approve.json() as any).job.status, 'APPROVED');

  const print = await fetch(`${base}/api/jobs/${job.id}/print`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paperSize: 'A4', colorMode: 'BlackAndWhite' }),
  });
  const printed: any = await print.json();
  assert.equal(printed.job.status, 'PRINT_COMMAND_SUBMITTED');
  assert.notEqual(printed.job.status, 'PRINTED');
  assert.equal(printed.job.printConfig.copies, 3);
  assert.equal(printed.job.printConfig.paperSize, 'A4');
  assert.equal(printed.job.printConfig.colorMode, 'BlackAndWhite');

  // 4. Cleanup -> DELETED, output no longer downloadable.
  const del = await fetch(`${base}/api/jobs/${job.id}`, { method: 'DELETE' });
  assert.equal((await del.json() as any).job.status, 'DELETED');
  const dl2 = await fetch(`${base}/api/jobs/${job.id}/download`);
  assert.equal(dl2.status, 409);
});
