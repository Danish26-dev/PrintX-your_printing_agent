// Pure derivation of the shopkeeper "agent cursor" step sequence from a job's
// REAL recorded events. This is the single source of truth the Workspace uses
// to animate the cursor, extracted here so it can be unit-tested in isolation
// (no DOM, no timers). It NEVER fabricates steps — a step exists only because
// the backend/adapter actually emitted the corresponding configuration event.

import { SETTING_FIELD_MAP } from './shopJobsService';

// Ordered field sequence used to replay the agent-cursor across the controls.
export const CURSOR_SEQUENCE = ['printer', 'copies', 'color', 'paper', 'layout', 'sides'];

// The required visible order of the per-setting controls (copies -> colour ->
// paper -> orientation -> sides). `printer` and `status` are handled before
// these as the discovery/availability steps; `result` is the terminal step.
export const SETTING_ORDER = ['copies', 'color', 'paper', 'layout', 'sides'];

// Event types that represent a failure line (the cursor must STOP on failure).
export const FAILED_EVENTS = new Set([
  'PROCESSING_FAILED',
  'CONVERSION_FAILED',
  'PRINT_FAILED',
  'NO_PRINTER_FOUND',
  'PRINTER_UNAVAILABLE',
  'CLEANUP_FAILED',
]);

// Job statuses that mean the whole configuration failed.
export const ANY_FAILED = new Set(['PRINT_FAILED', 'PROCESSING_FAILED', 'CONVERSION_FAILED']);

/**
 * Derive the ordered cursor steps from a job view.
 *
 * Returns:
 *   {
 *     steps: [{ field, label }],   // ordered controls the cursor visits
 *     terminal: 'verified' | 'submitted' | 'failed' | null,
 *     terminalField: 'result' | 'printer' | null,  // where the cursor rests
 *     failed: boolean,
 *   }
 *
 * Rules enforced here (so they are testable):
 *   - A per-setting step appears ONLY if a SETTING_APPLIED event for it exists.
 *   - Steps follow the required order: printer -> status -> copies -> colour ->
 *     paper -> orientation -> sides.
 *   - On failure the sequence STOPS (steps are truncated at the failed control)
 *     and no subsequent setting is marked successful; the cursor rests with a
 *     failure terminal.
 */
export function buildCursorSteps(job) {
  const events = Array.isArray(job?.events) ? job.events : [];

  // Collect the fields that really had a SETTING_APPLIED event, in order,
  // de-duplicated. The backend emits detail as "key=value"; translate the key
  // to the UI field id via SETTING_FIELD_MAP.
  const appliedFields = [];
  for (const ev of events) {
    if (ev.type === 'SETTING_APPLIED' && ev.detail) {
      const key = ev.detail.split('=')[0];
      const field = SETTING_FIELD_MAP[key] || key;
      if (CURSOR_SEQUENCE.includes(field) && !appliedFields.includes(field)) {
        appliedFields.push(field);
      }
    }
  }

  const hasChecking = events.some((e) => e.type === 'CHECKING_PRINTERS');
  const printerDetected = events.some((e) => e.type === 'PRINTER_DETECTED');
  const verified = events.some(
    (e) => e.type === 'CONFIGURATION_VERIFIED' || e.type === 'WAITING_FOR_APPROVAL',
  );
  const submitted = job?.status === 'PRINT_SUBMITTED' || job?.status === 'PRINT_COMMAND_SUBMITTED';
  const failedEvent = events.find((e) => FAILED_EVENTS.has(e.type));
  const failed = Boolean(failedEvent && ANY_FAILED.has(job?.status));

  const steps = [];
  if (hasChecking) steps.push({ field: 'printer', label: 'Checking available printers' });
  if (printerDetected) steps.push({ field: 'status', label: 'Printer available' });
  SETTING_ORDER.filter((f) => appliedFields.includes(f)).forEach((f) =>
    steps.push({ field: f, label: `Applied ${f}` }),
  );

  let terminal = null;
  let terminalField = null;
  if (failed) {
    // STOP on failure: the cursor rests on the printer with a failure label and
    // nothing beyond the failure is marked successful.
    terminal = 'failed';
    terminalField = 'printer';
  } else if (submitted) {
    terminal = 'submitted';
    terminalField = 'result';
  } else if (verified) {
    terminal = 'verified';
    terminalField = 'result';
  }

  return { steps, appliedFields, terminal, terminalField, failed };
}
