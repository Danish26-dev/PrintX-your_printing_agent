// Read-only access to a REAL backend job for the shopkeeper workspace.
//
// This lets the shopkeeper view the truthful lifecycle event trail of an actual
// job (by id) via the Backend. There is no shop-wide job feed endpoint yet, so
// the shopkeeper opens a specific job id (e.g. ?job=job_...). When no real job
// id is present, the workspace falls back to a clearly-labelled Demo Mode.

import { api, ApiError } from './apiClient';

/** Fetch a real job (events, status, printConfig, changeSummary). */
export async function fetchJob(jobId) {
  return api.getJob(jobId);
}

/**
 * Subscribe to a job's REAL live events via Server-Sent Events. Calls
 * `onJob(view)` with the full job view each time the backend emits an update.
 * Returns an unsubscribe function. Falls back to polling if SSE is unavailable.
 */
export function subscribeJob(jobId, onJob, onError) {
  let closed = false;
  let es = null;
  let pollTimer = null;

  const startPolling = () => {
    const poll = async () => {
      if (closed) return;
      try {
        const job = await fetchJob(jobId);
        if (!closed) onJob(job);
      } catch (err) {
        if (!closed && onError) onError(err);
      }
      if (!closed) pollTimer = setTimeout(poll, 2500);
    };
    poll();
  };

  try {
    es = new EventSource(api.eventsUrl(jobId));
    es.addEventListener('job', (ev) => {
      try {
        onJob(JSON.parse(ev.data));
      } catch {
        /* ignore malformed frame */
      }
    });
    es.onerror = () => {
      // SSE dropped — close it and fall back to polling so the panel keeps
      // reflecting real state (connection loss handling).
      if (es) es.close();
      es = null;
      if (!closed && !pollTimer) startPolling();
    };
  } catch {
    startPolling();
  }

  return () => {
    closed = true;
    if (es) es.close();
    if (pollTimer) clearTimeout(pollTimer);
  };
}

/** Human-readable labels for backend lifecycle events (truthful). */
export const EVENT_LABELS = {
  CUSTOMER_SENT_JOB: 'Customer sent job',
  JOB_RECEIVED: 'Job received',
  AGENT_ACKNOWLEDGED: 'Agent acknowledged',
  DOCUMENT_INSPECTION_STARTED: 'Inspecting document',
  DOCUMENT_INSPECTED: 'Document inspected',
  OPERATION_PLAN_CREATED: 'Operation plan created',
  OPERATION_PLAN_VALIDATED: 'Operation plan validated',
  DOCUMENT_EDIT_STARTED: 'Editing document',
  DOCUMENT_EDIT_COMPLETED: 'Document edit completed',
  PREVIEW_READY: 'Preview ready',
  NEEDS_CLARIFICATION: 'Needs clarification',
  // Printer configuration (real printer flow)
  PRINTER_CONFIG_STARTED: 'Printer configuration started',
  CHECKING_PRINTERS: 'Checking available printers',
  PRINTER_DETECTED: 'Printer detected',
  NO_PRINTER_FOUND: 'No printer found',
  PREPARING_SETTINGS: 'Preparing print settings',
  SETTING_APPLIED: 'Applied setting',
  CONFIGURATION_VERIFIED: 'Configuration verified',
  WAITING_FOR_APPROVAL: 'Waiting for approval',
  CUSTOMER_APPROVED: 'Approved',
  PRINT_CONFIGURATION_CREATED: 'Print configuration created',
  PRINT_SUBMITTED: 'Print submitted',
  PRINT_COMMAND_SUBMITTED: 'Print command submitted',
  PRINTING: 'Printing',
  PRINTED: 'Printed',
  PRINTER_UNAVAILABLE: 'Printer unavailable',
  CLEANUP_STARTED: 'Cleaning temporary files',
  CLEANUP_COMPLETED: 'Temporary files removed',
  PROCESSING_FAILED: 'Processing failed',
  CONVERSION_FAILED: 'Conversion failed',
  PRINT_FAILED: 'Print failed',
  CLEANUP_FAILED: 'Cleanup failed',
};

/** Map a SETTING_APPLIED detail ("key=value") to the PrintDialog field id. */
export const SETTING_FIELD_MAP = {
  printer: 'printer',
  copies: 'copies',
  colorMode: 'color',
  paperSize: 'paper',
  orientation: 'layout',
  sides: 'sides',
};

export { ApiError };
