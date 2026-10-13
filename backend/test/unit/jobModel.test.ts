/**
 * Unit tests for the job model + store and the safe view projection.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobStore, toView } from '../../src/jobs/jobModel.js';

test('create initializes an UPLOADED job with sane defaults', () => {
  const store = new JobStore();
  const job = store.create({
    id: 'job_1',
    originalFilename: 'r.docx',
    inputFormat: 'docx',
    inputFileReference: 'job_1_input.docx',
  });
  assert.equal(job.status, 'UPLOADED');
  assert.equal(job.copies, 1);
  assert.equal(job.outputFileReference, null);
});

test('update patches fields and bumps updatedAt', async () => {
  const store = new JobStore();
  const job = store.create({ id: 'job_2', originalFilename: 'r.docx', inputFormat: 'docx', inputFileReference: 'k' });
  const before = job.updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  const updated = store.update('job_2', { status: 'PROCESSING' });
  assert.equal(updated?.status, 'PROCESSING');
  assert.notEqual(updated?.updatedAt, before);
});

test('toView never exposes storage keys or paths', () => {
  const store = new JobStore();
  const job = store.create({
    id: 'job_3',
    originalFilename: 'r.docx',
    inputFormat: 'docx',
    inputFileReference: 'secret_input_key.docx',
  });
  store.update('job_3', { outputFileReference: 'secret_output_key.docx' });
  const view = toView(store.get('job_3')!) as unknown as Record<string, unknown>;
  assert.equal('inputFileReference' in view, false);
  assert.equal('outputFileReference' in view, false);
  assert.equal(view.hasOutput, true);
});
