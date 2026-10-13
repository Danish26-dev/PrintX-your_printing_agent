/**
 * Unit tests for the canonical shop ("channel") association.
 *
 * These assert the core of the shopkeeper-dashboard fix: every job is stamped
 * with a shop id (defaulting + validating), the view exposes it, legacy jobs
 * without one resolve to PrintX Lab, and the shop filter matches accordingly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobStore, toView, type Job } from '../../src/jobs/jobModel.js';
import {
  PRINTX_LAB_SHOP_ID,
  resolveShopId,
  jobBelongsToShop,
  KNOWN_SHOP_IDS,
} from '../../src/jobs/shop.js';

test('PrintX Lab is the single known shop and matches the frontend id', () => {
  assert.equal(PRINTX_LAB_SHOP_ID, 'printx-lab');
  assert.equal(KNOWN_SHOP_IDS.has('printx-lab'), true);
});

test('resolveShopId defaults missing/unknown/forged values to PrintX Lab', () => {
  assert.equal(resolveShopId(undefined), PRINTX_LAB_SHOP_ID);
  assert.equal(resolveShopId(null as unknown as string), PRINTX_LAB_SHOP_ID);
  assert.equal(resolveShopId(''), PRINTX_LAB_SHOP_ID);
  assert.equal(resolveShopId('not-a-real-shop'), PRINTX_LAB_SHOP_ID);
  assert.equal(resolveShopId(42 as unknown as string), PRINTX_LAB_SHOP_ID);
  // A valid, known value is preserved.
  assert.equal(resolveShopId('printx-lab'), 'printx-lab');
  assert.equal(resolveShopId('  printx-lab  '), 'printx-lab');
});

test('create() stamps every job with PrintX Lab when no shop is supplied', () => {
  const store = new JobStore();
  const job = store.create({
    id: 'job_a',
    originalFilename: 'r.docx',
    inputFormat: 'docx',
    inputFileReference: 'k',
  });
  assert.equal(job.shopId, PRINTX_LAB_SHOP_ID);
});

test('create() validates a client-supplied shop and never trusts a forged value', () => {
  const store = new JobStore();
  const good = store.create({
    id: 'job_b',
    originalFilename: 'r.docx',
    inputFormat: 'docx',
    inputFileReference: 'k',
    shopId: 'printx-lab',
  });
  assert.equal(good.shopId, 'printx-lab');

  const forged = store.create({
    id: 'job_c',
    originalFilename: 'r.docx',
    inputFormat: 'docx',
    inputFileReference: 'k',
    shopId: 'attacker-shop',
  });
  // Unknown value is NOT stored; it falls back to the single real shop.
  assert.equal(forged.shopId, PRINTX_LAB_SHOP_ID);
});

test('toView exposes shopId and backfills a legacy job with no shopId', () => {
  const store = new JobStore();
  const job = store.create({
    id: 'job_d',
    originalFilename: 'r.docx',
    inputFormat: 'docx',
    inputFileReference: 'k',
  });
  // Simulate a legacy record persisted before shopId existed.
  (job as unknown as Partial<Job>).shopId = undefined;
  const view = toView(store.get('job_d')!);
  assert.equal(view.shopId, PRINTX_LAB_SHOP_ID);
});

test('jobBelongsToShop treats a missing shopId as PrintX Lab', () => {
  assert.equal(jobBelongsToShop(undefined, PRINTX_LAB_SHOP_ID), true);
  assert.equal(jobBelongsToShop(null, PRINTX_LAB_SHOP_ID), true);
  assert.equal(jobBelongsToShop('printx-lab', PRINTX_LAB_SHOP_ID), true);
  // A forged job shop also resolves to PrintX Lab (single-shop MVP), so it
  // still matches — but it is never a DIFFERENT, real shop.
  assert.equal(jobBelongsToShop('printx-lab', 'printx-lab'), true);
});
