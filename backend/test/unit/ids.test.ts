/**
 * Unit tests for id/format helpers: format validation and safe key derivation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId, checkFormat, storageKey } from '../../src/util/ids.js';

test('newId is unique and prefixed', () => {
  const a = newId('job_');
  const b = newId('job_');
  assert.match(a, /^job_[a-f0-9]{32}$/);
  assert.notEqual(a, b);
});

test('checkFormat accepts docx and pdf by extension', () => {
  assert.equal(checkFormat('resume.docx', '').ok, true);
  assert.equal(checkFormat('scan.pdf', 'application/pdf').ok, true);
});

test('checkFormat rejects unsupported extensions', () => {
  assert.equal(checkFormat('image.png', 'image/png').ok, false);
  assert.equal(checkFormat('notes.txt', 'text/plain').ok, false);
  assert.equal(checkFormat('noext', '').ok, false);
});

test('checkFormat rejects clearly-wrong mime even with ok extension', () => {
  assert.equal(checkFormat('evil.docx', 'text/html').ok, false);
  assert.equal(checkFormat('evil.pdf', 'image/png').ok, false);
});

test('storageKey derives only from id + role + ext (no user path)', () => {
  const key = storageKey('job_deadbeef', 'input', 'docx');
  assert.equal(key, 'job_deadbeef_input.docx');
  // A malicious "ext" is sanitized.
  const safe = storageKey('job_x', 'output', '../../evil');
  assert.match(safe, /^job_x_output\.[a-z0-9]+$/);
});
