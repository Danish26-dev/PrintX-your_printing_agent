/**
 * Unit tests for the durable job-persistence sink wiring. These assert the
 * SAFE DEFAULT: with no JOB_STORE env (the dev/test default), persistence is a
 * no-op — the in-memory store behaves exactly as before, hydrate() returns 0,
 * and nothing throws. (The live Firestore path is exercised against a real
 * database in deployment, not in unit tests, so we never fake success here.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Ensure the default (memory) mode for this test process.
delete process.env.JOB_STORE;

const { jobPersistenceEnabled, loadAllJobs } = await import('../../src/jobs/jobPersistence.js');
const { JobStore } = await import('../../src/jobs/jobModel.js');

test('persistence is DISABLED by default (memory mode)', () => {
  assert.equal(jobPersistenceEnabled(), false);
});

test('loadAllJobs() returns [] when persistence is disabled', async () => {
  assert.deepEqual(await loadAllJobs(), []);
});

test('JobStore works normally and hydrate() is a safe no-op when disabled', async () => {
  const store = new JobStore();
  const job = store.create({
    id: 'job_test_persist_0001',
    originalFilename: 'doc.docx',
    inputFormat: 'docx',
    inputFileReference: 'job_test_persist_0001_input.docx',
  });
  assert.equal(job.id, 'job_test_persist_0001');
  assert.equal(store.get(job.id)?.status, 'UPLOADED');
  store.addEvent(job.id, 'JOB_RECEIVED');
  store.update(job.id, { status: 'PROCESSING' });
  assert.equal(store.get(job.id)?.status, 'PROCESSING');
  // Event ordering preserved.
  const types = store.get(job.id)!.events.map((e) => e.type);
  assert.deepEqual(types.slice(0, 2), ['CUSTOMER_SENT_JOB', 'JOB_RECEIVED']);
  // hydrate() must not throw and returns 0 (nothing durable to load).
  const n = await store.hydrate();
  assert.equal(n, 0);
});
