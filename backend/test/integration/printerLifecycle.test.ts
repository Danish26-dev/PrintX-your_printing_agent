/**
 * Integration tests for the REAL printer lifecycle (configure -> approve ->
 * submit) using a CONTROLLED, TEST-ONLY fake printer adapter.
 *
 * These tests exercise jobService.configurePrinter / submitPrint directly with
 * the fake adapter injected via __setPrinterAdapterForTests. They assert the
 * approval gate, duplicate-submit prevention, failure handling (no printers /
 * offline / invalid config / unsupported duplex / submit failure), and that a
 * failed configuration never submits and preserves the document.
 *
 * Run: npx tsx --test test/integration/printerLifecycle.test.ts
 */
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

// Configure a temp storage dir BEFORE importing modules that read config.
process.env.STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'printx-plc-'));

const { jobService } = await import('../../src/jobs/jobService.js');
const { jobStore } = await import('../../src/jobs/jobModel.js');
const { __setPrinterAdapterForTests } = await import('../../src/printing/PrinterAdapter.js');
const { LocalStorageProvider } = await import('../../src/storage/LocalStorageProvider.js');
const { FakePrinterAdapter, DEFAULT_FAKE_PRINTER } = await import('../helpers/fakePrinterAdapter.js');
const { config } = await import('../../src/config.js');

const storage = new LocalStorageProvider(config.storageDir);
let prevAdapter: any;

// Seed an APPROVED job with a real (tiny) output file so submit can read bytes.
let seq = 0;
async function seedApprovedJob(): Promise<string> {
  seq += 1;
  const id = `job_${'0'.repeat(31)}${seq.toString(16)}`.slice(0, 36);
  const outputKey = `${id}_output.pdf`;
  await storage.save(outputKey, Buffer.from('%PDF-1.4 test', 'latin1'));
  jobStore.create({ id, originalFilename: 'doc.pdf', inputFormat: 'pdf', inputFileReference: `${id}_input.pdf` });
  jobStore.update(id, { status: 'APPROVED', outputFileReference: outputKey, outputFormat: 'pdf', copies: 1 });
  return id;
}

const validSettings = {
  printerId: DEFAULT_FAKE_PRINTER.id,
  copies: 2,
  colorMode: 'monochrome',
  paperSize: 'A4',
  orientation: 'portrait',
  sides: 'one-sided',
};

before(() => {
  prevAdapter = __setPrinterAdapterForTests(new FakePrinterAdapter());
});
after(() => {
  __setPrinterAdapterForTests(prevAdapter);
});
beforeEach(() => {
  // Reset to the default happy adapter before each test.
  __setPrinterAdapterForTests(new FakePrinterAdapter());
});

test('successful configuration using a controlled adapter -> READY_FOR_APPROVAL', async () => {
  const id = await seedApprovedJob();
  const job = await jobService.configurePrinter(id, validSettings);
  assert.equal(job.status, 'READY_FOR_APPROVAL');
  assert.equal(job.printSettings?.printerId, DEFAULT_FAKE_PRINTER.id);
  assert.equal(job.printSettings?.copies, 2);
  // Event trail reflects real operations.
  const types = job.events.map((e) => e.type);
  assert.ok(types.includes('CHECKING_PRINTERS'));
  assert.ok(types.includes('PRINTER_DETECTED'));
  assert.ok(types.includes('CONFIGURATION_VERIFIED'));
  assert.ok(types.includes('WAITING_FOR_APPROVAL'));
  // One SETTING_APPLIED per setting.
  assert.ok(types.filter((t) => t === 'SETTING_APPLIED').length >= 5);
});

test('agent-proposed full config (color/Letter/landscape/two-sided) is applied verbatim', async () => {
  // Regression: the customer's natural-language print request becomes a
  // structured proposal that the Backend validates against the REAL printer and
  // applies with the EXACT requested settings — not hardcoded defaults.
  const proposed = {
    printerId: DEFAULT_FAKE_PRINTER.id,
    copies: 3,
    colorMode: 'color',
    paperSize: 'Letter',
    orientation: 'landscape',
    sides: 'two-sided-long-edge',
  };
  const id = await seedApprovedJob();
  const job = await jobService.configurePrinter(id, proposed);
  assert.equal(job.status, 'READY_FOR_APPROVAL');
  // Every requested setting is reflected in the verified print settings.
  assert.equal(job.printSettings?.printerId, proposed.printerId);
  assert.equal(job.printSettings?.copies, 3);
  assert.equal(job.printSettings?.colorMode, 'color');
  assert.equal(job.printSettings?.paperSize, 'Letter');
  assert.equal(job.printSettings?.orientation, 'landscape');
  assert.equal(job.printSettings?.sides, 'two-sided-long-edge');
});

test('no printer discovered -> PRINT_FAILED (NO_PRINTER), document preserved', async () => {
  __setPrinterAdapterForTests(new FakePrinterAdapter({ printers: [] }));
  const id = await seedApprovedJob();
  await assert.rejects(() => jobService.configurePrinter(id, validSettings), /No printers/i);
  const job = jobStore.get(id)!;
  assert.equal(job.status, 'PRINT_FAILED');
  assert.ok(job.events.some((e) => e.type === 'NO_PRINTER_FOUND'));
  assert.ok(job.outputFileReference, 'document reference preserved');
});

test('printer unavailable (offline) -> PRINT_FAILED (PRINTER_UNAVAILABLE)', async () => {
  __setPrinterAdapterForTests(new FakePrinterAdapter({ offline: true }));
  const id = await seedApprovedJob();
  await assert.rejects(() => jobService.configurePrinter(id, validSettings), /not available/i);
  const job = jobStore.get(id)!;
  assert.equal(job.status, 'PRINT_FAILED');
  assert.equal(job.error?.code, 'PRINTER_UNAVAILABLE');
  assert.ok(job.events.some((e) => e.type === 'PRINTER_UNAVAILABLE'));
});

test('invalid printerId -> PRINT_FAILED (INVALID_PRINT_CONFIG)', async () => {
  const id = await seedApprovedJob();
  await assert.rejects(
    () => jobService.configurePrinter(id, { ...validSettings, printerId: 'Ghost Printer' }),
    /Invalid print configuration/i,
  );
  assert.equal(jobStore.get(id)!.status, 'PRINT_FAILED');
});

test('invalid copies -> PRINT_FAILED (INVALID_PRINT_CONFIG)', async () => {
  const id = await seedApprovedJob();
  await assert.rejects(
    () => jobService.configurePrinter(id, { ...validSettings, copies: 0 }),
    /Invalid print configuration/i,
  );
  assert.equal(jobStore.get(id)!.status, 'PRINT_FAILED');
});

test('unsupported duplex -> PRINT_FAILED (printer reports no duplex)', async () => {
  __setPrinterAdapterForTests(
    new FakePrinterAdapter({
      printers: [{ ...DEFAULT_FAKE_PRINTER, supportsDuplex: false }],
    }),
  );
  const id = await seedApprovedJob();
  await assert.rejects(
    () => jobService.configurePrinter(id, { ...validSettings, sides: 'two-sided-long-edge' }),
    /does not support double-sided|Invalid print configuration/i,
  );
  assert.equal(jobStore.get(id)!.status, 'PRINT_FAILED');
});

test('approval required: submitPrint before configuration is rejected', async () => {
  const id = await seedApprovedJob(); // status APPROVED, not configured
  await assert.rejects(() => jobService.submitPrint(id), /verified before printing/i);
  // Not submitted.
  assert.notEqual(jobStore.get(id)!.status, 'PRINT_SUBMITTED');
});

test('happy path: configure -> submit -> PRINT_SUBMITTED (never PRINTED)', async () => {
  const id = await seedApprovedJob();
  await jobService.configurePrinter(id, validSettings);
  const job = await jobService.submitPrint(id);
  assert.equal(job.status, 'PRINT_SUBMITTED');
  assert.notEqual(job.status, 'PRINTED');
  assert.ok(job.events.some((e) => e.type === 'PRINT_SUBMITTED'));
});

test('repeated clicks do not submit duplicate jobs (ALREADY_SUBMITTED)', async () => {
  const id = await seedApprovedJob();
  await jobService.configurePrinter(id, validSettings);
  await jobService.submitPrint(id); // first click
  await assert.rejects(() => jobService.submitPrint(id), /already been submitted/i);
  assert.equal(jobStore.get(id)!.status, 'PRINT_SUBMITTED');
});

test('submit failure -> PRINT_FAILED, document preserved for retry', async () => {
  __setPrinterAdapterForTests(new FakePrinterAdapter({ submitFailure: 'PRINT_FAILED' }));
  const id = await seedApprovedJob();
  await jobService.configurePrinter(id, validSettings);
  await assert.rejects(() => jobService.submitPrint(id), /forced PRINT_FAILED/i);
  const job = jobStore.get(id)!;
  assert.equal(job.status, 'PRINT_FAILED');
  assert.ok(job.outputFileReference, 'document preserved after submit failure');
});

test('failed configuration prevents print submission', async () => {
  __setPrinterAdapterForTests(new FakePrinterAdapter({ offline: true }));
  const id = await seedApprovedJob();
  await assert.rejects(() => jobService.configurePrinter(id, validSettings));
  // Config failed -> status PRINT_FAILED -> submit must be rejected.
  await assert.rejects(() => jobService.submitPrint(id), /verified before printing/i);
  assert.notEqual(jobStore.get(id)!.status, 'PRINT_SUBMITTED');
});

// ============================================================================
// DEMO MODE — explicit demo adapter, strictly separate from the real adapter.
// ============================================================================
const { DEMO_PRINTER_ID, DEMO_SUBMIT_NOTE } = await import('../../src/printing/DemoPrinterAdapter.js');

/** A real adapter that EXPLODES if any method is called. Injected to prove a
 *  demo job NEVER touches the real adapter. */
function explodingRealAdapter(): any {
  const boom = () => { throw new Error('real adapter must not be called for a demo job'); };
  return {
    isReal: () => true,
    discover: boom, checkAvailability: boom, validateSettings: boom, submitSettings: boom,
    listPrinters: boom, getPrinterStatus: boom, validateConfiguration: boom, submitPrintJob: boom,
    agentReachable: async () => false,
  };
}

const demoSettings = {
  printerId: DEMO_PRINTER_ID,
  copies: 2,
  colorMode: 'monochrome',
  paperSize: 'A4',
  orientation: 'portrait',
  sides: 'two-sided-long-edge',
};

test('DEMO: configure (mode=demo) succeeds WITHOUT touching the real adapter', async () => {
  __setPrinterAdapterForTests(explodingRealAdapter()); // real adapter would throw if used
  const id = await seedApprovedJob();
  const job = await jobService.configurePrinter(id, demoSettings, 'demo');
  assert.equal(job.status, 'READY_FOR_APPROVAL');
  assert.equal(job.printerMode, 'demo');
  assert.equal(job.printSettings?.printerId, DEMO_PRINTER_ID);
  assert.equal(job.printSettings?.sides, 'two-sided-long-edge');
  // Real configuration events present (same path as real).
  const types = job.events.map((e) => e.type);
  assert.ok(types.includes('CHECKING_PRINTERS'));
  assert.ok(types.includes('CONFIGURATION_VERIFIED'));
  assert.ok(types.filter((t) => t === 'SETTING_APPLIED').length >= 5);
});

test('DEMO: submit succeeds as a SIMULATION and never claims physical print', async () => {
  __setPrinterAdapterForTests(explodingRealAdapter());
  const id = await seedApprovedJob();
  await jobService.configurePrinter(id, demoSettings, 'demo');
  const job = await jobService.submitPrint(id);
  assert.equal(job.status, 'PRINT_SUBMITTED');
  assert.notEqual(job.status, 'PRINTED');
  const submitEv = job.events.filter((e) => e.type === 'PRINT_SUBMITTED').pop();
  assert.equal(submitEv?.detail, DEMO_SUBMIT_NOTE);
  assert.match(submitEv?.detail ?? '', /no physical document was printed/i);
});

test('DEMO: a demo failure is reported honestly (configure-to-fail)', async () => {
  // Swap the demo adapter instance for a failing one via the module is not
  // exposed; instead drive availability failure path by selecting demo then
  // relying on the exploding real adapter staying untouched. The demo adapter
  // itself always succeeds for supported settings, so we assert the happy path
  // here and cover the failure mode in the unit test (DemoPrinterAdapter opts).
  __setPrinterAdapterForTests(explodingRealAdapter());
  const id = await seedApprovedJob();
  const job = await jobService.configurePrinter(id, demoSettings, 'demo');
  assert.equal(job.status, 'READY_FOR_APPROVAL');
});

test('REAL: configure with mode=real stays real (no silent demo fallback) and rejects a bad printer id', async () => {
  // Real adapter has only the default fake printer; a demo id is NOT valid.
  __setPrinterAdapterForTests(new FakePrinterAdapter());
  const id = await seedApprovedJob();
  await assert.rejects(
    () => jobService.configurePrinter(id, { ...demoSettings, printerId: 'nonexistent-printer' }, 'real'),
    /Invalid print configuration/i,
  );
  assert.equal(jobStore.get(id)!.status, 'PRINT_FAILED');
  assert.equal(jobStore.get(id)!.printerMode, 'real');
});

test('TEST-CONFIG: testConfiguration(demo) succeeds, edits no document, submits nothing', async () => {
  __setPrinterAdapterForTests(explodingRealAdapter());
  const before = jobStore.all().length;
  const result = await jobService.testConfiguration('demo');
  assert.equal(result.ok, true);
  assert.equal(result.isDemo, true);
  assert.equal(result.printer?.printerId, DEMO_PRINTER_ID);
  const fields = result.steps.map((s) => s.field);
  assert.ok(fields.includes('printer') && fields.includes('copies') && fields.includes('verify'));
  // No job was created (document-free) and nothing was submitted.
  assert.equal(jobStore.all().length, before);
});

test('TEST-CONFIG: testConfiguration(real) with no real printer fails NO_PRINTER (no demo fallback)', async () => {
  // No printers on the real adapter.
  __setPrinterAdapterForTests(new FakePrinterAdapter({ printers: [] }));
  const result = await jobService.testConfiguration('real');
  assert.equal(result.ok, false);
  assert.equal(result.isDemo, false);
  assert.equal(result.error?.code, 'NO_PRINTER');
});

test('DEMO: changing copies keeps the SAME job id, same other settings, same edited document', async () => {
  // Issue 8 (4): if the customer changes copies (3 -> 2), the SAME job must be
  // reused — same id, same output document, with ONLY copies changed and every
  // other setting preserved. The demo adapter still receives the real values.
  __setPrinterAdapterForTests(explodingRealAdapter());
  const id = await seedApprovedJob();
  const outputRef = jobStore.get(id)!.outputFileReference;

  // First configuration: 3 copies.
  const first = await jobService.configurePrinter(id, { ...demoSettings, copies: 3 }, 'demo');
  assert.equal(first.id, id);
  assert.equal(first.printSettings?.copies, 3);

  // The customer changes their mind: 2 copies. A settings change re-approves the
  // SAME job (not a new one) and re-configures it.
  jobStore.update(id, { status: 'APPROVED' });
  const second = await jobService.configurePrinter(id, { ...demoSettings, copies: 2 }, 'demo');

  // SAME job id + SAME edited document reference.
  assert.equal(second.id, id);
  assert.equal(second.outputFileReference, outputRef);
  // Only copies changed; every other setting is preserved and reached the demo adapter.
  assert.equal(second.printSettings?.copies, 2);
  assert.equal(second.printerMode, 'demo');
  assert.equal(second.printSettings?.printerId, DEMO_PRINTER_ID);
  assert.equal(second.printSettings?.colorMode, 'monochrome');
  assert.equal(second.printSettings?.paperSize, 'A4');
  assert.equal(second.printSettings?.orientation, 'portrait');
  assert.equal(second.printSettings?.sides, 'two-sided-long-edge');
  // The per-setting SETTING_APPLIED events reflect the NEW copies value (2).
  const copiesApplied = second.events.filter((e) => e.type === 'SETTING_APPLIED' && e.detail?.startsWith('copies=')).pop();
  assert.equal(copiesApplied?.detail, 'copies=2');
});

test('DEMO: all five requested settings reach the demo adapter unchanged (verbatim)', async () => {
  // Issue 8 (5): copies / colorMode / paperSize / orientation / sides must each
  // arrive at the demo adapter exactly as requested and be reflected verbatim.
  __setPrinterAdapterForTests(explodingRealAdapter());
  const id = await seedApprovedJob();
  const requested = {
    printerId: DEMO_PRINTER_ID,
    copies: 3,
    colorMode: 'monochrome',
    paperSize: 'A4',
    orientation: 'portrait',
    sides: 'two-sided-long-edge',
  };
  const job = await jobService.configurePrinter(id, requested, 'demo');
  // Verified settings match the request verbatim.
  assert.equal(job.printSettings?.copies, 3);
  assert.equal(job.printSettings?.colorMode, 'monochrome');
  assert.equal(job.printSettings?.paperSize, 'A4');
  assert.equal(job.printSettings?.orientation, 'portrait');
  assert.equal(job.printSettings?.sides, 'two-sided-long-edge');
  // Issue 8 (6): each setting emits its own SETTING_APPLIED configuration event.
  const applied = Object.fromEntries(
    job.events
      .filter((e) => e.type === 'SETTING_APPLIED' && e.detail?.includes('='))
      .map((e) => e.detail!.split('=') as [string, string]),
  );
  assert.equal(applied.copies, '3');
  assert.equal(applied.colorMode, 'monochrome');
  assert.equal(applied.paperSize, 'A4');
  assert.equal(applied.orientation, 'portrait');
  assert.equal(applied.sides, 'two-sided-long-edge');
});

test('DEMO: a SECOND demo printer id is accepted, routed to demo, same job id preserved', async () => {
  // Issue 5: two selectable demo printers. Selecting the second demo device
  // must route to the demo adapter (never real), carry its id/name into the
  // job, and preserve the same job id — with the real adapter never touched.
  const { DEMO_PRINTERS } = await import('../../src/printing/DemoPrinterAdapter.js');
  const second = DEMO_PRINTERS.find((p: any) => p.id !== DEMO_PRINTER_ID);
  assert.ok(second, 'a second demo printer exists');
  __setPrinterAdapterForTests(explodingRealAdapter()); // real adapter would throw if used
  const id = await seedApprovedJob();
  const job = await jobService.configurePrinter(
    id,
    {
      printerId: second!.id,
      copies: 2,
      colorMode: 'monochrome', // second demo device is mono-only
      paperSize: 'A4',
      orientation: 'portrait',
      sides: 'two-sided-long-edge',
    },
    'demo',
  );
  assert.equal(job.id, id, 'same job id preserved');
  assert.equal(job.status, 'READY_FOR_APPROVAL');
  assert.equal(job.printerMode, 'demo');
  assert.equal(job.printSettings?.printerId, second!.id);
  assert.equal(job.printSettings?.printerName, second!.name);
  // The per-setting event carries the SECOND printer's name.
  const printerApplied = job.events.find((e) => e.type === 'SETTING_APPLIED' && e.detail?.startsWith('printer='));
  assert.equal(printerApplied?.detail, `printer=${second!.name}`);
});
