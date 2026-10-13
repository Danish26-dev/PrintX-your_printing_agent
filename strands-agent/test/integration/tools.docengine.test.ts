/**
 * Integration tests for the agent tools against the REAL Python Document Engine
 * (no AWS/Bedrock involved). These verify the deterministic half of the
 * pipeline: inspect -> plan (validate) -> execute -> Document Engine.
 *
 * Requires the Document Engine running at DOCUMENT_ENGINE_URL (default
 * http://localhost:5001). If it is not reachable, the tests are skipped with a
 * clear message rather than faking success.
 *
 * Run: npm run test:integration
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildTools, type DocumentContext } from '../../src/tools/documentTools.js';
import { documentEngine } from '../../src/clients/documentEngineClient.js';
import { makeDocx } from '../helpers/docxFixture.js';

let engineUp = false;

before(async () => {
  engineUp = await documentEngine.health();
  if (!engineUp) {
    console.warn(
      '\n[SKIP] Document Engine not reachable — start it first:\n' +
        '  cd document-engine && .\\venv\\Scripts\\python.exe -m uvicorn app.main:app --port 5001\n',
    );
  }
});

async function ctxFor(text: string): Promise<DocumentContext> {
  return { fileBuffer: await makeDocx(text), filename: 'fixture.docx' };
}

test('inspect_document returns the document text', async (t) => {
  if (!engineUp) return t.skip('engine down');
  const ctx = await ctxFor('Hello John from Acme Corp');
  const { inspectDocument } = buildTools(ctx);
  const out = JSON.parse((await inspectDocument.invoke({})) as string);
  assert.ok(out.text.includes('John'));
  assert.equal(ctx.extractedText?.includes('Acme Corp'), true);
});

test('plan_operations validates a good plan and rejects a bad one', async (t) => {
  if (!engineUp) return t.skip('engine down');
  const ctx = await ctxFor('Hello John');
  const { planOperations } = buildTools(ctx);

  const good = JSON.parse(
    (await planOperations.invoke(
      { operations: [{ type: 'replace_text', find: 'John', replace: 'Jane' }] },
      {} as any,
    )) as string,
  );
  assert.equal(good.valid, true);

  const bad = JSON.parse(
    (await planOperations.invoke(
      { operations: [{ type: 'run_python', code: 'x' }] },
      {} as any,
    )) as string,
  );
  assert.equal(bad.valid, false);
});

test('execute_operation_plan: simple replace_text', async (t) => {
  if (!engineUp) return t.skip('engine down');
  const ctx = await ctxFor('Hello John from Acme Corp');
  const { executeOperationPlan } = buildTools(ctx);
  const out = JSON.parse(
    (await executeOperationPlan.invoke(
      { operations: [{ type: 'replace_text', find: 'John', replace: 'Jane' }] },
      {} as any,
    )) as string,
  );
  assert.equal(out.executed, true);
  assert.equal(out.changes.total_replacements, 1);
  assert.equal(ctx.lastProcessResult?.output_format, 'docx');
});

test('execute_operation_plan: replace_text + set_copies', async (t) => {
  if (!engineUp) return t.skip('engine down');
  const ctx = await ctxFor('Md Danish Ali is the author. Contact Md Danish Ali.');
  const { executeOperationPlan } = buildTools(ctx);
  const out = JSON.parse(
    (await executeOperationPlan.invoke(
      {
        operations: [
          { type: 'replace_text', find: 'Md Danish Ali', replace: 'Omkar L Kulkarni' },
          { type: 'set_copies', copies: 3 },
        ],
      },
      {} as any,
    )) as string,
  );
  assert.equal(out.executed, true);
  assert.equal(out.changes.copies, 3);
  assert.equal(out.changes.total_replacements, 2);
});

test('execute_operation_plan: multiple distinct replacements', async (t) => {
  if (!engineUp) return t.skip('engine down');
  const ctx = await ctxFor('Alpha and Beta and Alpha again');
  const { executeOperationPlan } = buildTools(ctx);
  const out = JSON.parse(
    (await executeOperationPlan.invoke(
      {
        operations: [
          { type: 'replace_text', find: 'Alpha', replace: 'One' },
          { type: 'replace_text', find: 'Beta', replace: 'Two' },
        ],
      },
      {} as any,
    )) as string,
  );
  assert.equal(out.executed, true);
  assert.equal(out.changes.total_replacements, 3); // 2x Alpha + 1x Beta
});

test('execute_operation_plan: text not found reports zero replacements', async (t) => {
  if (!engineUp) return t.skip('engine down');
  const ctx = await ctxFor('This document mentions nobody special.');
  const { executeOperationPlan } = buildTools(ctx);
  const out = JSON.parse(
    (await executeOperationPlan.invoke(
      { operations: [{ type: 'replace_text', find: 'Nonexistent Name', replace: 'X' }] },
      {} as any,
    )) as string,
  );
  assert.equal(out.executed, true);
  assert.equal(out.changes.total_replacements, 0);
});

test('execute_operation_plan: refuses to execute an invalid plan', async (t) => {
  if (!engineUp) return t.skip('engine down');
  const ctx = await ctxFor('Hello');
  const { executeOperationPlan } = buildTools(ctx);
  const out = JSON.parse(
    (await executeOperationPlan.invoke(
      { operations: [{ type: 'delete_everything' }] as any },
      {} as any,
    )) as string,
  );
  assert.equal(out.executed, false);
});
