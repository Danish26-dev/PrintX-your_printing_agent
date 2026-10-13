// Tests for the pure cursor step-derivation (Issue 8 items 6-9). This is the
// exact logic the shopkeeper Workspace uses to drive the agent cursor, so these
// assertions prove the real behaviour, not a re-implementation.

import { buildCursorSteps, CURSOR_SEQUENCE, SETTING_ORDER } from './cursorSequence';
import { SETTING_FIELD_MAP } from './shopJobsService';

// A realistic, complete configuration event trail as the backend emits it
// (SETTING_APPLIED detail is "key=value" with the backend's settings keys).
function fullConfigEvents({ copies = 3 } = {}) {
  return [
    { type: 'PRINTER_CONFIG_STARTED', detail: 'demo' },
    { type: 'CHECKING_PRINTERS' },
    { type: 'PREPARING_SETTINGS' },
    { type: 'PRINTER_DETECTED', detail: 'PrintX Demo Printer' },
    { type: 'SETTING_APPLIED', detail: 'printer=PrintX Demo Printer' },
    { type: 'SETTING_APPLIED', detail: `copies=${copies}` },
    { type: 'SETTING_APPLIED', detail: 'colorMode=monochrome' },
    { type: 'SETTING_APPLIED', detail: 'paperSize=A4' },
    { type: 'SETTING_APPLIED', detail: 'orientation=portrait' },
    { type: 'SETTING_APPLIED', detail: 'sides=two-sided-long-edge' },
    { type: 'CONFIGURATION_VERIFIED' },
    { type: 'PRINT_CONFIGURATION_CREATED' },
    { type: 'WAITING_FOR_APPROVAL' },
  ];
}

describe('SETTING_FIELD_MAP — backend keys map to the correct cursor targets', () => {
  test('each backend setting key maps to its UI control field', () => {
    expect(SETTING_FIELD_MAP).toMatchObject({
      printer: 'printer',
      copies: 'copies',
      colorMode: 'color',
      paperSize: 'paper',
      orientation: 'layout',
      sides: 'sides',
    });
  });
});

describe('buildCursorSteps — order and mapping (Issue 8: 6, 7, 8)', () => {
  test('a full verified configuration yields the required ordered sequence', () => {
    const job = { status: 'READY_FOR_APPROVAL', events: fullConfigEvents() };
    const { steps, terminal, terminalField, failed } = buildCursorSteps(job);
    const fields = steps.map((s) => s.field);
    // printer -> status -> copies -> colour -> paper -> orientation -> sides
    expect(fields).toEqual(['printer', 'status', 'copies', 'color', 'paper', 'layout', 'sides']);
    expect(failed).toBe(false);
    expect(terminal).toBe('verified');
    expect(terminalField).toBe('result');
  });

  test('per-setting fields follow SETTING_ORDER regardless of event arrival order', () => {
    // Emit the SETTING_APPLIED events OUT of canonical order; the derived cursor
    // order must still be copies -> colour -> paper -> orientation -> sides.
    const shuffled = [
      { type: 'CHECKING_PRINTERS' },
      { type: 'PRINTER_DETECTED', detail: 'PrintX Demo Printer' },
      { type: 'SETTING_APPLIED', detail: 'paperSize=A4' },
      { type: 'SETTING_APPLIED', detail: 'copies=3' },
      { type: 'SETTING_APPLIED', detail: 'orientation=portrait' },
      { type: 'SETTING_APPLIED', detail: 'colorMode=monochrome' },
      { type: 'SETTING_APPLIED', detail: 'sides=two-sided-long-edge' },
      { type: 'CONFIGURATION_VERIFIED' },
    ];
    const job = { status: 'READY_FOR_APPROVAL', events: shuffled };
    const fields = buildCursorSteps(job).steps.map((s) => s.field).filter((f) => SETTING_ORDER.includes(f));
    expect(fields).toEqual(['copies', 'color', 'paper', 'layout', 'sides']);
  });

  test('only settings that actually emitted an event appear (copies-only change)', () => {
    const job = {
      status: 'READY_FOR_APPROVAL',
      events: [
        { type: 'CHECKING_PRINTERS' },
        { type: 'PRINTER_DETECTED', detail: 'PrintX Demo Printer' },
        { type: 'SETTING_APPLIED', detail: 'copies=2' },
        { type: 'CONFIGURATION_VERIFIED' },
      ],
    };
    const fields = buildCursorSteps(job).steps.map((s) => s.field);
    expect(fields).toEqual(['printer', 'status', 'copies']);
  });

  test('submitted job rests the cursor on the result control', () => {
    const job = { status: 'PRINT_SUBMITTED', events: [...fullConfigEvents(), { type: 'PRINT_SUBMITTED', detail: 'done' }] };
    const { terminal, terminalField } = buildCursorSteps(job);
    expect(terminal).toBe('submitted');
    expect(terminalField).toBe('result');
  });

  test('no events yet -> no steps, no terminal', () => {
    const { steps, terminal } = buildCursorSteps({ status: 'CONFIGURING_PRINTER', events: [] });
    expect(steps).toEqual([]);
    expect(terminal).toBeNull();
  });
});

describe('buildCursorSteps — STOP on failure (Issue 8: 9)', () => {
  test('a printer-unavailable failure stops the sequence and does not mark later settings', () => {
    // The printer was detected and copies applied, then availability failed
    // BEFORE colour/paper/orientation/sides. No success terminal is produced.
    const job = {
      status: 'PRINT_FAILED',
      events: [
        { type: 'CHECKING_PRINTERS' },
        { type: 'PRINTER_DETECTED', detail: 'PrintX Demo Printer' },
        { type: 'SETTING_APPLIED', detail: 'copies=3' },
        { type: 'PRINTER_UNAVAILABLE', detail: 'offline' },
      ],
    };
    const { steps, terminal, terminalField, failed } = buildCursorSteps(job);
    expect(failed).toBe(true);
    expect(terminal).toBe('failed');
    expect(terminalField).toBe('printer');
    // Only the controls that genuinely got events appear; nothing after the
    // failure is present, and the terminal is NOT a success.
    const fields = steps.map((s) => s.field);
    expect(fields).not.toContain('color');
    expect(fields).not.toContain('sides');
  });

  test('NO_PRINTER_FOUND failure -> failed terminal, no success', () => {
    const job = {
      status: 'PRINT_FAILED',
      events: [{ type: 'CHECKING_PRINTERS' }, { type: 'NO_PRINTER_FOUND' }],
    };
    const { terminal, failed } = buildCursorSteps(job);
    expect(failed).toBe(true);
    expect(terminal).toBe('failed');
  });
});

describe('CURSOR_SEQUENCE contract', () => {
  test('includes exactly the printer + five per-setting fields', () => {
    expect(CURSOR_SEQUENCE).toEqual(['printer', 'copies', 'color', 'paper', 'layout', 'sides']);
  });
});
