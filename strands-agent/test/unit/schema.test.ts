/**
 * Unit tests for the closed operation schema (no network, no AWS).
 * Covers requirement cases: unknown operation rejection, malicious operation
 * (run_python) rejection, and valid single/multiple operation plans.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operationPlan } from '../../src/schema.js';

test('accepts a single valid replace_text operation', () => {
  const r = operationPlan.safeParse({
    operations: [{ type: 'replace_text', find: 'John', replace: 'Jane' }],
  });
  assert.equal(r.success, true);
});

test('accepts replace_text + set_copies (multiple operations)', () => {
  const r = operationPlan.safeParse({
    operations: [
      { type: 'replace_text', find: 'Md Danish Ali', replace: 'Omkar L Kulkarni' },
      { type: 'set_copies', copies: 3 },
    ],
  });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.operations.length, 2);
});

test('rejects an unknown operation type', () => {
  const r = operationPlan.safeParse({
    operations: [{ type: 'reformat_everything', style: 'fancy' }],
  });
  assert.equal(r.success, false);
});

test('rejects a malicious run_python operation', () => {
  const r = operationPlan.safeParse({
    operations: [{ type: 'run_python', code: "os.system('rm -rf /')" }],
  });
  assert.equal(r.success, false);
});

test('rejects replace_text with a blank find', () => {
  const r = operationPlan.safeParse({
    operations: [{ type: 'replace_text', find: '   ', replace: 'x' }],
  });
  assert.equal(r.success, false);
});

test('rejects set_copies out of range', () => {
  const r = operationPlan.safeParse({
    operations: [{ type: 'set_copies', copies: 100000 }],
  });
  assert.equal(r.success, false);
});

test('rejects replace_text missing the replace field', () => {
  const r = operationPlan.safeParse({
    operations: [{ type: 'replace_text', find: 'John' }],
  });
  assert.equal(r.success, false);
});
