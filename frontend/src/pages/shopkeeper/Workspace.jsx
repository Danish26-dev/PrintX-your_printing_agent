import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Printer, MousePointer2, CheckCircle2, Radio, AlertTriangle, RefreshCw } from 'lucide-react';
import ShopkeeperLayout from '../../components/shopkeeper/ShopkeeperLayout';
import PrinterControlsPanel from '../../components/shopkeeper/PrinterControlsPanel';
import { useNavigate } from 'react-router-dom';
import { getActiveJob } from '../../services/jobsService';
import { subscribeJob, EVENT_LABELS, ApiError } from '../../services/shopJobsService';
import { buildCursorSteps, FAILED_EVENTS, ANY_FAILED } from '../../services/cursorSequence';
import { api } from '../../services/apiClient';
import { getSelectedDevice, subscribeSelectedDevice } from '../../services/selectedDeviceService';
import { MonitorPlay } from 'lucide-react';

// Status groupings.
const CONFIGURING = new Set(['CONFIGURING_PRINTER']);
// Printer-side failures (retryable through re-configuration).
const PRINTER_FAILED = new Set(['PRINT_FAILED']);
// Document-side failures (NOT retryable from the shopkeeper printer panel).
const DOC_FAILED = new Set(['PROCESSING_FAILED', 'CONVERSION_FAILED']);

const ShopkeeperWorkspace = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get('job');

  const [job, setJob] = useState(null);
  const [connError, setConnError] = useState(null);
  const [cursor, setCursor] = useState({ x: 50, y: 50, visible: false, label: '' });
  const [activeField, setActiveField] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(getSelectedDevice());
  const navigate = useNavigate();

  const stageRef = useRef(null); // the scroll region containing the controls
  const colRef = useRef(null); // the positioned column; coordinate basis for the cursor
  const lastConfigKeyRef = useRef('');
  // The events.length at which we last animated to a terminal state (verified /
  // submitted / failed). Used to ignore stale, shorter event snapshots that
  // would otherwise restart the cursor animation under rapid re-renders.
  const terminalPlayedRef = useRef(null);
  const animTimersRef = useRef([]);
  // The field the cursor currently rests on — used to recompute its position
  // when the layout changes (resize / rerender) so it stays over the control.
  const cursorFieldRef = useRef(null);
  // Mirrors whether this job is in demo mode, readable inside the event-driven
  // cursor effect without adding it to the effect deps.
  const isDemoRef = useRef(false);

  // Adopt the current active job when none is specified in the URL.
  useEffect(() => {
    if (jobId) return;
    let cancelled = false;
    getActiveJob().then((aj) => {
      if (!cancelled && aj?.id) setSearchParams({ job: aj.id }, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [jobId, setSearchParams]);

  // Subscribe to REAL backend events for this job (SSE, polling fallback).
  useEffect(() => {
    if (!jobId) return undefined;
    setConnError(null);
    // A different job starts a fresh cursor replay.
    lastConfigKeyRef.current = '';
    terminalPlayedRef.current = null;
    const unsub = subscribeJob(
      jobId,
      (view) => {
        setJob(view);
        setConnError(null);
      },
      (err) => setConnError(err?.message || 'Connection lost. Retrying…'),
    );
    return unsub;
  }, [jobId]);

  // Keep the selected device (REAL vs DEMO) in sync with the dashboard choice.
  useEffect(() => subscribeSelectedDevice(setSelectedDevice), []);

  // Clear any scheduled cursor animation timers.
  const clearTimers = useCallback(() => {
    animTimersRef.current.forEach((t) => clearTimeout(t));
    animTimersRef.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // Move the UI-only cursor to a control by its data-field. Pure visualization
  // inside the PrintX UI — it never controls the OS mouse. Returns true if the
  // target was found.
  const moveCursorTo = useCallback((fieldId, label) => {
    const stage = stageRef.current;
    const col = colRef.current;
    if (!stage || !col) return false;
    cursorFieldRef.current = fieldId; // remember for resize/scroll/rerender recompute
    const target = fieldId ? stage.querySelector(`[data-field="${fieldId}"]`) : null;
    if (!target) {
      setCursor((c) => ({ ...c, visible: true, label: label ?? c.label }));
      return false;
    }
    // The cursor overlay is a child of the (position:relative) column, so its
    // left/top % are relative to the COLUMN, not the scrolling stage. We read
    // the live control rect each time so it stays correct across scroll/resize.
    const cRect = col.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    // Rest the pointer just left of the control's right edge so it never covers
    // the value.
    const x = ((tRect.left + tRect.width * 0.82 - cRect.left) / cRect.width) * 100;
    const y = ((tRect.top + tRect.height / 2 - cRect.top) / cRect.height) * 100;
    // Keep the pointer visually inside the column.
    setCursor((c) => ({ ...c, x: Math.max(2, Math.min(96, x)), y: Math.max(3, Math.min(97, y)), visible: true, label: label ?? c.label }));
    return true;
  }, []);

  // Recompute the cursor position when the layout changes (window resize or the
  // config panel rerenders), so it stays correctly over the active control.
  useEffect(() => {
    const recompute = () => {
      if (cursorFieldRef.current) moveCursorTo(cursorFieldRef.current, undefined);
    };
    window.addEventListener('resize', recompute);
    const stage = stageRef.current;
    // Recompute when the controls region scrolls (the one intentional scroll
    // area) so the pointer tracks the control under it.
    if (stage) stage.addEventListener('scroll', recompute, { passive: true });
    let ro;
    if (typeof ResizeObserver !== 'undefined' && stage) {
      ro = new ResizeObserver(recompute);
      ro.observe(stage);
    }
    return () => {
      window.removeEventListener('resize', recompute);
      if (stage) stage.removeEventListener('scroll', recompute);
      if (ro) ro.disconnect();
    };
  }, [moveCursorTo]);

  // Replay the agent-cursor across the controls, STEP BY STEP, driven by the
  // REAL events the backend recorded during configuration. We do NOT fabricate
  // state — we only animate the pointer between the fields that actually got a
  // SETTING_APPLIED event. The sequence ends in the real terminal state
  // (verified, or a visible failure). A visual delay interpolates between the
  // real event targets; it never simulates a successful operation.
  useEffect(() => {
    if (!job || !Array.isArray(job.events)) return;

    // Derive the ordered steps from the REAL recorded events (pure, tested in
    // services/cursorSequence.js). Steps exist only for events that actually
    // happened; a failure truncates the sequence and never marks later settings
    // as successful.
    const { steps, appliedFields, terminal, terminalField, failed } = buildCursorSteps(job);
    const failedEvent = job.events.find((e) => FAILED_EVENTS.has(e.type));

    // Only (re)play when the real configuration trail changes.
    const key = `${job.status}:${job.events.length}:${appliedFields.join(',')}:${failedEvent?.type || ''}`;
    if (key === lastConfigKeyRef.current) return;

    // Stability guard: the configure phase emits ALL events almost at once, and
    // two near-simultaneous sources push the job view — the SSE stream and the
    // configure HTTP response (handleConfigured). These can arrive out of order
    // with different events.length. Once we have ALREADY animated to a terminal
    // state (verified / submitted / failed), a later push with FEWER events (a
    // stale/earlier snapshot) must NOT restart the whole animation from step 0.
    // We settle the cursor on the terminal control instead of replaying. This
    // keeps the real event-driven motion but prevents the cursor from looping
    // or never reaching the end under rapid re-renders.
    const playedCount = terminalPlayedRef.current;
    if (playedCount != null && job.events.length < playedCount) {
      lastConfigKeyRef.current = key;
      return;
    }

    lastConfigKeyRef.current = key;
    if (terminal) terminalPlayedRef.current = job.events.length;
    else terminalPlayedRef.current = null;

    clearTimers();

    const stepMs = 650;

    // A printer/config failure ends on the failed control (or the printer) with
    // a visible failure — never a success. The cursor STOPS here; subsequent
    // settings are not visited or marked done.
    if (failed) {
      steps.forEach((s, i) => {
        const t = setTimeout(() => {
          setActiveField(s.field);
          moveCursorTo(s.field, s.label);
        }, i * stepMs);
        animTimersRef.current.push(t);
      });
      const tEnd = setTimeout(() => {
        setActiveField(null);
        moveCursorTo('printer', 'Configuration failed');
      }, steps.length * stepMs);
      animTimersRef.current.push(tEnd);
      return;
    }

    if (steps.length === 0 && !terminal) {
      // Nothing to visualize yet.
      setCursor((c) => ({ ...c, visible: false }));
      setActiveField(null);
      return;
    }

    steps.forEach((s, i) => {
      const t = setTimeout(() => {
        setActiveField(s.field);
        moveCursorTo(s.field, s.label);
      }, i * stepMs);
      animTimersRef.current.push(t);
    });

    // Finish on the real terminal state. The Approve & Print button lives
    // outside the cursor stage, so for a submitted job we rest the pointer on
    // the last configured control and show the real "submitted" label rather
    // than chasing a target that isn't on the stage.
    const tEnd = setTimeout(() => {
      if (terminalField === 'result' && terminal === 'submitted') {
        setActiveField('result');
        moveCursorTo('result', isDemoRef.current ? 'Demo print completed' : 'Print submitted to the spooler');
      } else if (terminalField === 'result' && terminal === 'verified') {
        setActiveField('result');
        moveCursorTo('result', 'Configuration verified');
      }
    }, steps.length * stepMs);
    animTimersRef.current.push(tEnd);
  }, [job, moveCursorTo, clearTimers]);

  const handleApproveAndPrint = async () => {
    if (!jobId || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await api.submitPrint(jobId); // READY_FOR_APPROVAL -> PRINT_SUBMITTED
      // SSE pushes the new status; no optimistic fake success.
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not submit the print job.');
    } finally {
      setSubmitting(false);
    }
  };

  // The printer panel pushes the updated job after a (re)configuration.
  const handleConfigured = useCallback((updated) => {
    if (updated) {
      setJob(updated);
      setActionError(null);
    }
  }, []);

  const marker = (type) => (FAILED_EVENTS.has(type) ? '×' : '✓');

  const status = job?.status;
  const readyForApproval = status === 'READY_FOR_APPROVAL';
  const configuring = CONFIGURING.has(status);
  const submitted = status === 'PRINT_SUBMITTED' || status === 'PRINT_COMMAND_SUBMITTED';
  const printerFailed = PRINTER_FAILED.has(status);
  const docFailed = DOC_FAILED.has(status);
  const online = readyForApproval || submitted || configuring;

  // A printer error is retryable from here; a document error is not (that must
  // be fixed in the customer chat, not the printer panel).
  const errorKind = docFailed ? 'document' : printerFailed ? 'printer' : null;

  // The adapter mode for THIS job: prefer the mode the job was actually
  // configured with; before configuration, reflect the shopkeeper's selection.
  const mode = job?.printerMode || selectedDevice?.mode || null;
  const isDemo = mode === 'demo';
  isDemoRef.current = isDemo;
  // Demo success message surfaced from the real submitted event (never a fake
  // physical print).
  const submittedNote = submitted
    ? (job?.events?.slice().reverse().find((e) => e.type === 'PRINT_SUBMITTED')?.detail || '')
    : '';
  // No device chosen yet AND the job has not been configured: keep the cursor
  // idle and prompt the shopkeeper to pick a printer.
  const noDeviceSelected = !selectedDevice && !job?.printerMode && !job?.printSettings;

  return (
    <ShopkeeperLayout
      title="PrintsX Agent Workspace"
      subtitle="Live printer-agent operations (real)"
      contentClassName="sk-content-fill"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {mode && (
            <span className={`pm-type ${isDemo ? 'demo' : 'real'}`}>{isDemo ? 'DEMO' : 'REAL'}</span>
          )}
          <span className="sk-agent-live">
            <span className={`sk-dot ${submitted ? 'green' : ANY_FAILED.has(status) ? 'red' : online ? 'green' : 'gray'}`} />
            {status ? (EVENT_LABELS[status] || status) : 'No job'}
          </span>
        </div>
      }
    >
      {!jobId ? (
        <div className="sk-card">
          <h3 className="sk-card-title"><Radio size={16} /> No job selected</h3>
          <p style={{ color: '#9CA3AF', fontSize: 14 }}>
            Open a job from the dashboard, or append <code>?job=&lt;id&gt;</code> to the URL. The
            activity below is driven by real backend events — there is no demo simulation.
          </p>
        </div>
      ) : (
        <div className="sk-ws3">
          {/* A. CURRENT JOB — compact horizontal card at the TOP */}
          <div className="sk-job-strip">
            <div className="sk-job-strip-item">
              <span className="sk-job-k"><FileText size={13} /> Filename</span>
              <span className="sk-job-v" title={job?.originalFilename}>{job?.originalFilename || '—'}</span>
            </div>
            <div className="sk-job-strip-item">
              <span className="sk-job-k">Job ID</span>
              <span className="sk-job-v mono">{job ? `${job.id.slice(0, 16)}…` : '—'}</span>
            </div>
            <div className="sk-job-strip-item grow">
              <span className="sk-job-k">Customer instruction</span>
              <span className="sk-job-v" title={job?.instruction || ''}>{job?.instruction || '—'}</span>
            </div>
            <div className="sk-job-strip-item">
              <span className="sk-job-k">Status</span>
              <span className="sk-job-v">
                <span className={`sk-dot ${submitted ? 'green' : ANY_FAILED.has(status) ? 'red' : online ? 'green' : 'gray'}`} />
                {status ? (EVENT_LABELS[status] || status) : '—'}
              </span>
            </div>
            {mode && <span className={`pm-type ${isDemo ? 'demo' : 'real'}`}>{isDemo ? 'DEMO' : 'REAL'}</span>}
          </div>

          {/* B. MAIN — 70% printer configuration + live cursor | 30% preview */}
          <div className="workspace-main">
            {/* LEFT 70% — printer configuration + the live agent cursor */}
            <section className="ws-config-col" ref={colRef}>
              <div className="ws-config-head">
                <div className="ws-selected">
                  <Printer size={15} />
                  <span>Selected Printer: <strong>{selectedDevice?.name || job?.printSettings?.printerName || (isDemo ? 'PrintsX Demo Printer' : 'None')}</strong></span>
                  <span className={`pm-badge ${noDeviceSelected ? 'offline' : 'online'}`}>
                    {noDeviceSelected ? 'NONE' : isDemo ? 'DEMO · READY' : (readyForApproval || submitted ? 'READY' : (status ? 'READY' : 'READY'))}
                  </span>
                </div>
                {noDeviceSelected && (
                  <button className="sk-btn ghost" onClick={() => navigate('/shopkeeper/dashboard')}>
                    <MonitorPlay size={14} /> Choose a printer
                  </button>
                )}
              </div>

              {/* The controls scroll inside .ws-stage (the ONE intentional
                  scroll region). The cursor overlay is a SIBLING of the scroll
                  area (child of the position:relative column) so it is never
                  clipped by the scroll container and never scrolls away. */}
              <div className="ws-stage" ref={stageRef}>
                <PrinterControlsPanel
                  job={job}
                  jobId={jobId}
                  onConfigured={handleConfigured}
                  cursorActiveField={activeField}
                  selectedDevice={selectedDevice}
                />
                {noDeviceSelected && (
                  <div className="ws-stage-overlay">
                    <AlertTriangle size={18} /> Select a printer to continue.
                  </div>
                )}
              </div>
              {cursor.visible && (
                <div className="sk-cursor ws-cursor" style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}>
                  <MousePointer2 size={20} color="#fff" fill="#2563EB" />
                  {cursor.label && <span className="sk-cursor-label">{cursor.label}</span>}
                </div>
              )}

              {/* Approve & Print lives under the controls (same 70% column). */}
              <div className="ws-config-foot">
                {errorKind && job?.error && (
                  <div className="sk-error-box">
                    <AlertTriangle size={16} />
                    <div>
                      <strong>{errorKind === 'document' ? 'Document problem' : 'Printer problem'}</strong>
                      <p className="sk-error-msg">{job.error.message}</p>
                      <p className="sk-error-code">Code: {job.error.code}</p>
                    </div>
                  </div>
                )}
                {actionError && (
                  <div className="sk-activity-line failed"><span className="mk">×</span>{actionError}</div>
                )}
                <button
                  className="sk-btn primary"
                  onClick={handleApproveAndPrint}
                  disabled={!readyForApproval || submitting}
                  title={readyForApproval ? 'Submit this job to the printer' : 'Configuration must be verified first'}
                >
                  <Printer size={16} />
                  {submitting ? 'Submitting…' : submitted ? 'Submitted' : isDemo ? 'Approve & Run Demo' : 'Approve & Print'}
                </button>
              </div>
            </section>

            {/* RIGHT 30% — document preview (bounded, own scroll) */}
            <section className="ws-preview-col">
              <div className="ws-preview-head">
                <FileText size={14} />
                <span className="ws-preview-name" title={job?.originalFilename}>{job?.originalFilename || 'Document'}</span>
              </div>
              {job?.hasOutput ? (
                <div className="ws-preview-frame">
                  <iframe title="Edited document preview" src={api.previewUrl(jobId)} />
                </div>
              ) : (
                <p className="ws-preview-empty">No processed document available.</p>
              )}
            </section>
          </div>

          {/* C. LIVE ACTIVITY strip + final status */}
          <div className="sk-activity-strip">
            <div className="sk-activity-strip-row">
              <span className="sk-activity-strip-k">Live activity</span>
              <span className="sk-activity-strip-v">
                {cursor.label
                  || (configuring ? 'Configuring printer…' : readyForApproval ? 'Configuration verified' : submitted ? 'Submitted' : 'Idle')}
              </span>
              <span className="sk-activity-strip-sep" />
              <span className="sk-activity-strip-k">Result</span>
              <span className="sk-activity-strip-v">
                {submitted
                  ? (isDemo
                      ? 'Demo print completed successfully. No physical document was printed.'
                      : 'Print submitted to the spooler · physical completion not confirmed')
                  : readyForApproval
                    ? (isDemo ? 'Demo configuration verified' : 'Configuration verified')
                    : ANY_FAILED.has(status)
                      ? (job?.error?.message || 'Configuration failed')
                      : configuring
                        ? 'In progress…'
                        : '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </ShopkeeperLayout>
  );
};

export default ShopkeeperWorkspace;
