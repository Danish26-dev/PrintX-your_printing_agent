/**
 * Unit tests for the explicit DemoPrinterAdapter. No real printer, no network,
 * no OS. These lock in the hard rules: the demo adapter is clearly a demo
 * (isReal false / isDemo true), supports every setting deterministically, and
 * reports success as a SIMULATION that never claims physical print.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DemoPrinterAdapter,
  demoPrinterAdapter,
  DEMO_PRINTER_ID,
  DEMO_PRINTER,
  DEMO_PRINTERS,
  DEMO_PRINTER_IDS,
  DEMO_SUBMIT_NOTE,
} from '../../src/printing/DemoPrinterAdapter.js';

test('demo adapter is clearly a DEMO (not real)', () => {
  assert.equal(demoPrinterAdapter.isReal(), false);
  assert.equal(demoPrinterAdapter.isDemo(), true);
});

test('demo discovery returns the labelled demo devices (two selectable demos)', async () => {
  const printers = await demoPrinterAdapter.discover();
  assert.equal(printers.length, 2);
  // The primary/default device is present and matches DEMO_PRINTER.
  const primary = printers.find((p) => p.id === DEMO_PRINTER_ID);
  assert.ok(primary, 'primary demo device present');
  assert.equal(primary!.id, DEMO_PRINTER.id);
  assert.equal(primary!.name, DEMO_PRINTER.name);
  assert.equal(primary!.status, 'online');
  // A distinct second demo device is present.
  const second = printers.find((p) => p.id !== DEMO_PRINTER_ID);
  assert.ok(second, 'second demo device present');
  assert.notEqual(second!.id, DEMO_PRINTER_ID);
  // All discovered ids are recognised demo ids.
  for (const p of printers) assert.ok(DEMO_PRINTER_IDS.has(p.id));
  assert.equal(DEMO_PRINTERS.length, 2);
});

test('demo availability is online for ANY demo id, not_found otherwise', async () => {
  for (const d of DEMO_PRINTERS) {
    assert.deepEqual(await demoPrinterAdapter.checkAvailability(d.id), {
      available: true,
      status: 'online',
    });
  }
  const other = await demoPrinterAdapter.checkAvailability('some-real-printer');
  assert.equal(other.available, false);
  assert.equal(other.status, 'not_found');
});

test('second demo device enforces its own (narrower) capabilities', () => {
  const second = DEMO_PRINTERS.find((p) => p.id !== DEMO_PRINTER_ID)!;
  // The second demo device is mono-only; requesting colour on it must fail
  // validation (honest capability enforcement, still fully simulated).
  if (second.supportsColor === false) {
    const r = demoPrinterAdapter.validateSettings(
      { printerId: second.id, copies: 1, colorMode: 'color', paperSize: 'A4', orientation: 'portrait', sides: 'one-sided' },
      [],
    );
    assert.equal(r.ok, false);
  }
  // Monochrome on the same device is accepted.
  const ok = demoPrinterAdapter.validateSettings(
    { printerId: second.id, copies: 1, colorMode: 'monochrome', paperSize: 'A4', orientation: 'portrait', sides: 'one-sided' },
    [],
  );
  assert.equal(ok.ok, true);
});

test('demo validates every supported setting deterministically', () => {
  const r = demoPrinterAdapter.validateSettings(
    {
      printerId: DEMO_PRINTER_ID,
      copies: 2,
      colorMode: 'monochrome',
      paperSize: 'A4',
      orientation: 'portrait',
      sides: 'two-sided-long-edge',
    },
    [DEMO_PRINTER],
  );
  assert.equal(r.ok, true);
  assert.equal(r.value?.sides, 'two-sided-long-edge');
  // Colour + Letter + landscape + duplex-short-edge also supported.
  assert.equal(
    demoPrinterAdapter.validateSettings(
      { printerId: DEMO_PRINTER_ID, copies: 10, colorMode: 'color', paperSize: 'Letter', orientation: 'landscape', sides: 'two-sided-short-edge' },
      [DEMO_PRINTER],
    ).ok,
    true,
  );
});

test('demo submit SUCCEEDS as a simulation and NEVER claims physical print', async () => {
  const result = await demoPrinterAdapter.submitSettings(
    { printerId: DEMO_PRINTER_ID, copies: 1, colorMode: 'monochrome', paperSize: 'A4', orientation: 'portrait', sides: 'one-sided' },
    Buffer.from('%PDF demo'),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.state, 'PRINT_SUBMITTED');
    assert.notEqual(result.state as string, 'PRINTED');
    assert.equal(result.note, DEMO_SUBMIT_NOTE);
    assert.match(result.note, /no physical document was printed/i);
  }
});

test('demo adapter can be configured to FAIL deterministically', async () => {
  const failing = new DemoPrinterAdapter({ submitFailure: 'PRINT_FAILED' });
  const r = await failing.submitSettings(
    { printerId: DEMO_PRINTER_ID, copies: 1, colorMode: 'monochrome', paperSize: 'A4', orientation: 'portrait', sides: 'one-sided' },
    Buffer.from('x'),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.state, 'PRINT_FAILED');
});

test('demo adapter can report the device OFFLINE for an availability-failure demo', async () => {
  const offline = new DemoPrinterAdapter({ offline: true });
  const avail = await offline.checkAvailability(DEMO_PRINTER_ID);
  assert.equal(avail.available, false);
  assert.equal(avail.status, 'offline');
});
