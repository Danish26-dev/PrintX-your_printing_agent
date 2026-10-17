import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Printer, Minus, Plus, CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../services/apiClient';

/**
 * PrintX printer-controls panel (NOT the browser's native print dialog).
 *
 * This is the real PrintX configuration surface the shopkeeper operates:
 *  - the printer list is populated from REAL discovery (GET /api/printers),
 *  - every control reflects the job's verified/proposed settings,
 *  - changing a setting and pressing "Apply configuration" re-runs the REAL
 *    backend validation + printer adapter (POST /configure-printer), so the UI
 *    never claims a setting is applied unless the adapter confirmed it,
 *  - approval stays disabled unless the job is verified and a printer is online.
 *
 * `data-field` attributes are preserved so the agent-cursor visualization can
 * target each control (printer/copies/color/paper/layout/sides/print).
 */

const PAPER_SIZES = ['A4', 'Letter', 'Legal'];

// Build the initial editable settings from the job: prefer the VERIFIED
// settings, fall back to the agent's PROPOSED settings, then safe defaults.
function initialSettings(job) {
  const v = job?.printSettings;
  const p = job?.proposedPrintSettings;
  return {
    printerId: v?.printerId || p?.printerId || '',
    copies: v?.copies ?? p?.copies ?? job?.copies ?? 1,
    colorMode: v?.colorMode || p?.colorMode || 'monochrome',
    paperSize: v?.paperSize || p?.paperSize || 'A4',
    orientation: v?.orientation || p?.orientation || 'portrait',
    sides: v?.sides || p?.sides || 'one-sided',
  };
}

// Does the current form differ from the job's verified settings?
function differsFromVerified(form, verified) {
  if (!verified) return true;
  return (
    form.printerId !== verified.printerId ||
    form.copies !== verified.copies ||
    form.colorMode !== verified.colorMode ||
    form.paperSize !== verified.paperSize ||
    form.orientation !== verified.orientation ||
    form.sides !== verified.sides
  );
}

const Segment = ({ fieldId, active, value, options, onChange, disabled }) => (
  <div className={`pc-field ${active === fieldId ? 'hot' : ''}`} data-field={fieldId}>
    <label className="pc-label">{options.label}</label>
    <div className="pc-segment" role="group" aria-label={options.label}>
      {options.items.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'on' : ''}
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

const PrinterControlsPanel = ({ job, jobId, onConfigured, cursorActiveField, selectedDevice }) => {
  const verified = job?.printSettings || null;
  // The explicit adapter mode for this panel: demo selection stays demo.
  const mode = job?.printerMode || selectedDevice?.mode || null;
  const isDemo = mode === 'demo';

  const [printers, setPrinters] = useState([]);
  const [demoPrinter, setDemoPrinter] = useState(null);
  const [realPrinting, setRealPrinting] = useState(false);
  const [agentReachable, setAgentReachable] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [form, setForm] = useState(() => initialSettings(job));
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);

  // Load the printer list (real discovery) + the explicit demo device. Expose a
  // manual refresh. The demo device is ALWAYS available independently of
  // physical printer discovery.
  const loadPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    try {
      const data = await api.listPrinters();
      const list = Array.isArray(data.printers) ? data.printers : [];
      setPrinters(list);
      setDemoPrinter(data.demoPrinter || null);
      setRealPrinting(Boolean(data.realPrinting));
      setAgentReachable(Boolean(data.agentReachable));
      // Default the selected printer: when demo mode is active, select the demo
      // device; otherwise the verified one, else the discovered default/first.
      setForm((f) => {
        if (isDemo) return { ...f, printerId: (data.demoPrinter?.id || f.printerId || 'demo-printer') };
        if (f.printerId && list.some((p) => p.id === f.printerId)) return f;
        const def = list.find((p) => p.isDefault) || list[0];
        return def ? { ...f, printerId: def.id } : f;
      });
    } catch {
      setPrinters([]);
      setDemoPrinter(null);
      setRealPrinting(false);
      setAgentReachable(false);
    } finally {
      setLoadingPrinters(false);
    }
  }, [isDemo]);

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  // When the backend pushes new verified settings (after a (re)configuration),
  // sync the form to them so the controls reflect the real applied values.
  useEffect(() => {
    if (verified) setForm(initialSettings(job));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified?.printerId, verified?.copies, verified?.colorMode, verified?.paperSize, verified?.orientation, verified?.sides]);

  // The dropdown options: real discovered printers, PLUS the explicit demo
  // device when demo mode is active (so the dropdown never contradicts the
  // header by saying "No printers detected" while Demo Printer is selected).
  const printerOptions = useMemo(() => {
    const opts = [...printers];
    const demo = demoPrinter || (isDemo ? { id: 'demo-printer', name: 'PrintsX Demo Printer', status: 'online' } : null);
    if (isDemo && demo && !opts.some((p) => p.id === demo.id)) opts.unshift(demo);
    return opts;
  }, [printers, demoPrinter, isDemo]);

  const selectedPrinter = useMemo(
    () => printerOptions.find((p) => p.id === form.printerId) || null,
    [printerOptions, form.printerId],
  );

  // The demo device is always READY; a real device is online only when it says so.
  const printerOnline = isDemo ? true : selectedPrinter ? selectedPrinter.status === 'online' : false;
  const dirty = differsFromVerified(form, verified);

  const setField = (key, value) => {
    setApplyError(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const changeCopies = (delta) => {
    setApplyError(null);
    setForm((f) => ({ ...f, copies: Math.max(1, Math.min(999, (f.copies || 1) + delta)) }));
  };

  // Re-validate + apply the current form against the REAL printer adapter.
  const applyConfiguration = async () => {
    if (!jobId || applying) return;
    setApplying(true);
    setApplyError(null);
    try {
      const updated = await api.configurePrinter(
        jobId,
        {
          printerId: form.printerId || undefined,
          copies: form.copies,
          colorMode: form.colorMode,
          paperSize: form.paperSize,
          orientation: form.orientation,
          sides: form.sides,
        },
        mode || undefined, // EXPLICIT adapter mode: demo edits stay on the demo adapter
      );
      if (onConfigured) onConfigured(updated);
    } catch (err) {
      // The backend validated against the real printer and rejected it — show
      // the honest reason; do NOT claim the configuration succeeded.
      setApplyError(err instanceof ApiError ? err.message : 'Could not apply the configuration.');
    } finally {
      setApplying(false);
    }
  };

  // Configuration status badge derived from the REAL job state (never faked).
  const configStatus = (() => {
    if (applying) return { kind: 'pending', label: 'Applying…', Icon: Loader2 };
    if (applyError) return { kind: 'failed', label: 'Failed', Icon: XCircle };
    if (job?.status === 'PRINT_FAILED') return { kind: 'failed', label: 'Failed', Icon: XCircle };
    if (dirty && verified) return { kind: 'pending', label: 'Unsaved changes', Icon: AlertTriangle };
    // Submitted: distinguish demo completion from a real spooler submission.
    if (job?.status === 'PRINT_SUBMITTED' || job?.status === 'PRINT_COMMAND_SUBMITTED') {
      return { kind: 'verified', label: isDemo ? 'Demo print completed' : 'Print submitted', Icon: CheckCircle2 };
    }
    if (job?.status === 'READY_FOR_APPROVAL' && verified) {
      return job.configWarnings?.length
        ? { kind: 'warning', label: 'Verified with warnings', Icon: AlertTriangle }
        : { kind: 'verified', label: 'Configuration verified', Icon: CheckCircle2 };
    }
    if (job?.status === 'CONFIGURING_PRINTER') return { kind: 'pending', label: 'Configuring…', Icon: Loader2 };
    return { kind: 'idle', label: 'Not configured', Icon: AlertTriangle };
  })();

  const controlsDisabled = applying || loadingPrinters;
  // "No printers" only when NOT in demo mode and no real printers exist. In
  // demo mode the demo device is always available.
  const noPrinters = !loadingPrinters && !isDemo && printerOptions.length === 0;

  return (
    <div className="pc-panel">
      <div className="pc-head">
        <h3 className="sk-card-title" style={{ margin: 0 }}>
          <Printer size={16} /> Printer Configuration
        </h3>
        <span className={`pc-status ${configStatus.kind} ${cursorActiveField === 'result' ? 'hot' : ''}`} data-field="result">
          <configStatus.Icon size={14} className={configStatus.kind === 'pending' ? 'spin' : ''} />
          {configStatus.label}
        </span>
      </div>

      {/* Printer selector + real availability */}
      <div className={`pc-field ${cursorActiveField === 'printer' ? 'hot' : ''}`} data-field="printer">
        <label className="pc-label" htmlFor="pc-printer">Printer</label>
        <div className="pc-printer-row">
          <select
            id="pc-printer"
            className="pc-select"
            value={form.printerId}
            disabled={controlsDisabled || noPrinters}
            onChange={(e) => setField('printerId', e.target.value)}
          >
            {noPrinters && <option value="">No printers detected</option>}
            {printerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.id === 'demo-printer' ? ' (DEMO)' : p.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pc-refresh"
            title="Re-scan printers"
            onClick={loadPrinters}
            disabled={loadingPrinters}
          >
            <RefreshCw size={14} className={loadingPrinters ? 'spin' : ''} />
          </button>
        </div>
        <div className={`pc-availability ${cursorActiveField === 'status' ? 'hot' : ''}`} data-field="status">
          {loadingPrinters ? (
            <span className="pc-dot gray" />
          ) : (
            <span className={`pc-dot ${printerOnline ? 'green' : selectedPrinter ? 'red' : 'gray'}`} />
          )}
          <span className="pc-availability-text">
            {loadingPrinters
              ? 'Checking printer agent…'
              : isDemo
                ? 'DEMO · READY — simulated device (no physical printer required)'
                : noPrinters
                  ? (agentReachable ? 'Printer agent reachable, but no printer installed' : 'Local printer agent not reachable')
                  : selectedPrinter
                    ? selectedPrinter.status
                    : 'Select a printer'}
          </span>
        </div>
      </div>

      {/* Copies */}
      <div className={`pc-field ${cursorActiveField === 'copies' ? 'hot' : ''}`} data-field="copies">
        <label className="pc-label">Copies</label>
        <div className="pc-copies">
          <button type="button" className="pc-step" onClick={() => changeCopies(-1)} disabled={controlsDisabled || form.copies <= 1} aria-label="Decrease copies">
            <Minus size={14} />
          </button>
          <span className="pc-copies-val">{form.copies}</span>
          <button type="button" className="pc-step" onClick={() => changeCopies(1)} disabled={controlsDisabled || form.copies >= 999} aria-label="Increase copies">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Colour */}
      <Segment
        fieldId="color"
        active={cursorActiveField}
        value={form.colorMode}
        disabled={controlsDisabled}
        onChange={(v) => setField('colorMode', v)}
        options={{
          label: 'Colour',
          items: [
            { value: 'monochrome', label: 'Black & White' },
            { value: 'color', label: 'Colour' },
          ],
        }}
      />

      {/* Paper size */}
      <div className={`pc-field ${cursorActiveField === 'paper' ? 'hot' : ''}`} data-field="paper">
        <label className="pc-label" htmlFor="pc-paper">Paper size</label>
        <select
          id="pc-paper"
          className="pc-select"
          value={form.paperSize}
          disabled={controlsDisabled}
          onChange={(e) => setField('paperSize', e.target.value)}
        >
          {PAPER_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Orientation */}
      <Segment
        fieldId="layout"
        active={cursorActiveField}
        value={form.orientation}
        disabled={controlsDisabled}
        onChange={(v) => setField('orientation', v)}
        options={{
          label: 'Orientation',
          items: [
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
          ],
        }}
      />

      {/* Sides */}
      <Segment
        fieldId="sides"
        active={cursorActiveField}
        value={form.sides}
        disabled={controlsDisabled}
        onChange={(v) => setField('sides', v)}
        options={{
          label: 'Sides',
          items: [
            { value: 'one-sided', label: 'Single-sided' },
            { value: 'two-sided-long-edge', label: 'Double (long edge)' },
            { value: 'two-sided-short-edge', label: 'Double (short edge)' },
          ],
        }}
      />

      {/* Capability warnings from the REAL validation (unverified duplex/colour). */}
      {job?.configWarnings?.length > 0 && !dirty && (
        <div className="sk-warn-box">
          <AlertTriangle size={14} />
          <ul>
            {job.configWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Apply error (real backend rejection — honest). */}
      {applyError && (
        <div className="sk-error-box">
          <AlertTriangle size={14} />
          <span>{applyError}</span>
        </div>
      )}

      {/* Apply (re-validate against the real printer). Only shown when there are
          unsaved changes or the configuration failed and can be retried. */}
      <button
        type="button"
        className="sk-btn ghost pc-apply"
        onClick={applyConfiguration}
        disabled={applying || noPrinters || !form.printerId}
      >
        {applying ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        {applying ? 'Applying…' : dirty ? 'Apply configuration' : 'Re-verify configuration'}
      </button>
    </div>
  );
};

export default PrinterControlsPanel;
