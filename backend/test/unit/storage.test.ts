/**
 * Unit tests for LocalStorageProvider: round-trip, idempotent delete, exists,
 * and path-traversal protection. No network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalStorageProvider } from '../../src/storage/LocalStorageProvider.js';

async function tmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'printx-store-'));
}

test('save/read round-trip', async () => {
  const store = new LocalStorageProvider(await tmpRoot());
  await store.save('job_abc_input.docx', Buffer.from('hello'));
  const out = await store.read('job_abc_input.docx');
  assert.equal(out.toString(), 'hello');
});

test('exists reflects presence', async () => {
  const store = new LocalStorageProvider(await tmpRoot());
  assert.equal(await store.exists('nope.docx'), false);
  await store.save('there.docx', Buffer.from('x'));
  assert.equal(await store.exists('there.docx'), true);
});

test('delete is idempotent (no throw when absent)', async () => {
  const store = new LocalStorageProvider(await tmpRoot());
  await store.delete('missing.docx'); // must not throw
  await store.save('gone.docx', Buffer.from('x'));
  await store.delete('gone.docx');
  assert.equal(await store.exists('gone.docx'), false);
  await store.delete('gone.docx'); // second delete: still no throw
});

test('rejects path traversal keys', async () => {
  const store = new LocalStorageProvider(await tmpRoot());
  await assert.rejects(() => store.save('../escape.docx', Buffer.from('x')));
  await assert.rejects(() => store.read('../../etc/passwd'));
  await assert.rejects(() => store.save('sub/dir.docx', Buffer.from('x')));
  await assert.rejects(() => store.save('..', Buffer.from('x')));
});
