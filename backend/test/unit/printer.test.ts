/**
 * Unit tests for the PrinterAdapter config validation + honest behavior.
 * No real printer, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NullPrinterAdapter,
  validatePrintConfig,
  buildPrintConfig,
} from '../../src/printing/PrinterAdapter.js';

test('buildPrintConfig applies safe defaults and overrides', () => {
  const cfg = buildPrintConfig({ copies: 3, paperSize: 'A4', colorMode: 'BlackAndWhite' });
  assert.equal(cfg.copies, 3);
  assert.equal(cfg.paperSize, 'A4');
  assert.equal(cfg.colorMode, 'BlackAndWhite');
  assert.equal(cfg.pagesPerSheet, 1);
});

test('validatePrintConfig rejects out-of-range copies and bad enums', () => {
  assert.equal(validatePrintConfig(buildPrintConfig({ copies: 0 })).ok, false);
  assert.equal(validatePrintConfig(buildPrintConfig({ copies: 1000 })).ok, false);
  assert.equal(validatePrintConfig({ ...buildPrintConfig(), paperSize: 'A3' as any }).ok, false);
  assert.equal(validatePrintConfig({ ...buildPrintConfig(), pagesPerSheet: 3 as any }).ok, false);
  assert.equal(validatePrintConfig({ ...buildPrintConfig(), pageRange: 'abc' }).ok, false);
});

test('validatePrintConfig accepts valid config incl page ranges', () => {
  assert.equal(validatePrintConfig(buildPrintConfig()).ok, true);
  assert.equal(validatePrintConfig(buildPrintConfig({ pageRange: '1-3,5' })).ok, true);
});

test('NullPrinterAdapter is honest: not real, fabricates no printers, refuses to submit', async () => {
  const adapter = new NullPrinterAdapter();
  assert.equal(adapter.isReal(), false);
  // No fabricated devices.
  assert.deepEqual(await adapter.listPrinters(), []);
  assert.deepEqual(await adapter.discover(), []);
  assert.equal((await adapter.agentReachable()), false);
  // Submitting without a real local agent must FAIL honestly — never a fake success.
  const result = await adapter.submitPrintJob(buildPrintConfig({ copies: 2 }), Buffer.from('x'));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.state, 'PRINTER_ADAPTER_UNAVAILABLE');
    assert.notEqual(result.state as string, 'PRINTED');
  }
});

test('NullPrinterAdapter reports no availability when no agent is connected', async () => {
  const adapter = new NullPrinterAdapter();
  const avail = await adapter.checkAvailability('any-printer');
  assert.equal(avail.available, false);
});
