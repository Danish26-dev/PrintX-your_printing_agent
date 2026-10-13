import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Printer, Cpu, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2, Plug, FlaskConical, MousePointer2,
} from 'lucide-react';
import { api, ApiError } from '../../services/apiClient';
import { getSelectedDevice, setSelectedDevice, subscribeSelectedDevice } from '../../services/selectedDeviceService';

/**
 * "Printers & Devices" dashboard section.
 *
 * - Shows the local printer-agent status (REAL path) honestly.
 * - Lists ACTUAL discovered printers (never fabricated).
 * - Offers an EXPLICIT, clearly-labelled Demo Printer.
 * - Lets the shopkeeper select exactly one device (persisted via
 *   selectedDeviceService, shared with the Workspace).
 * - "Test Agent Configuration" runs a document-free config test through the
 *   SELECTED adapter and replays the agent cursor over the returned real steps.
 *
 * It never hardcodes a connected printer and never silently falls back to demo.
 */

const FIELD_LABEL = {
  printer: 'Printer', copies: 'Copies', color: 'Colour', paper: 'Paper size',
  layout: 'Orientation', sides: 'Sides', verify: 'Verification',
};

const PrinterManagement = () => {
  const [printers, setPrinters] = useState([]);
  const [demoPrinters, setDemoPrinters] = useState([]);
  const [realPrinting, setRealPrinting] = useState(false);
  const [agentReachable, setAgentReachable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(getSelectedDevice());
  // Which demo device the dropdown currently points at (id). Defaults to the
  // selected demo (if any) or the first demo device once loaded.
  const [demoChoiceId, setDemoChoiceId] = useState('');

  // Test Agent Configuration state.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);
  const [cursorStep, setCursorStep] = useState(-1); // index into testResult.steps
  const stageRef = useRef(null);
  const timersRef = useRef([]);

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };

  const discover = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listPrinters();
      setPrinters(Array.isArray(data.printers) ? data.printers : []);
      // Prefer the new demoPrinters[] list; fall back to the single demoPrinter
      // for backward compatibility with an older backend.
      const demos = Array.isArray(data.demoPrinters)
        ? data.demoPrinters
        : data.demoPrinter
          ? [data.demoPrinter]
          : [];
      setDemoPrinters(demos);
      setRealPrinting(Boolean(data.realPrinting));
      setAgentReachable(Boolean(data.agentReachable));
    } catch {
      setPrinters([]); setDemoPrinters([]); setRealPrinting(false); setAgentReachable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { discover(); }, [discover]);
  useEffect(() => subscribeSelectedDevice(setSelected), []);
  useEffect(() => () => clearTimers(), []);

  // Keep the demo dropdown pointed at a valid device: prefer the currently
  // selected demo device, else the first available demo printer.
  useEffect(() => {
    if (demoPrinters.length === 0) return;
    const ids = demoPrinters.map((d) => d.id);
    if (demoChoiceId && ids.includes(demoChoiceId)) return;
    const preferred = selected?.mode === 'demo' && ids.includes(selected.id) ? selected.id : demoPrinters[0].id;
    setDemoChoiceId(preferred);
  }, [demoPrinters, selected, demoChoiceId]);

  const selectReal = (p) => {
    setTestResult(null); setTestError(null); setCursorStep(-1);
    setSelectedDevice({
      id: p.id, name: p.name, mode: 'real', status: p.status,
      capabilities: { supportsColor: p.supportsColor, supportsDuplex: p.supportsDuplex, paperSizes: p.paperSizes },
    });
  };
  const selectDemo = (d) => {
    if (!d) return;
    setTestResult(null); setTestError(null); setCursorStep(-1);
    setSelectedDevice({
      id: d.id, name: d.name, mode: 'demo', status: d.status,
      capabilities: { supportsColor: d.supportsColor, supportsDuplex: d.supportsDuplex, paperSizes: d.paperSizes },
    });
  };

  // Replay the cursor over the REAL steps returned by the backend test. The
  // animation only visualizes steps that actually happened; on failure it stops
  // at the last real step (no fabricated later steps).
  const runCursor = (steps) => {
    clearTimers();
    setCursorStep(-1);
    steps.forEach((_, i) => {
      const t = setTimeout(() => setCursorStep(i), i * 600);
      timersRef.current.push(t);
    });
  };

  const runTest = async () => {
    if (!selected || testing) return;
    setTesting(true); setTestError(null); setTestResult(null); setCursorStep(-1);
    try {
      const result = await api.testConfiguration(selected.mode);
      setTestResult(result);
      runCursor(result.steps || []);
    } catch (err) {
      setTestError(err instanceof ApiError ? err.message : 'The configuration test could not run.');
    } finally {
      setTesting(false);
    }
  };

  const agentOnline = agentReachable && realPrinting;
  const noneSelected = !selected;
  const demoChoice = demoPrinters.find((d) => d.id === demoChoiceId) || demoPrinters[0] || null;

  // Position the cursor over the active step chip inside the stage.
  const activeFieldId = testResult?.steps?.[cursorStep]?.field;

  return (
    <div className="sk-card sk-printers">
      <h3 className="sk-card-title"><Printer size={16} /> Printers &amp; Devices</h3>

      {/* Printer agent status (REAL path) */}
      <div className="pm-agent-row">
        <Cpu size={16} color={agentOnline ? '#22C55E' : '#9CA3AF'} />
        <span className="pm-label">Printer Agent</span>
        <span className={`pm-badge ${agentOnline ? 'online' : 'offline'}`}>
          {loading ? 'Checking…' : agentOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
        <button className="sk-btn ghost pm-refresh" onClick={discover} disabled={loading} title="Discover printers">
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Discover
        </button>
      </div>

      {/* Available real printers */}
      <div className="pm-section">
        <p className="sk-section-label">Available Printers (real)</p>
        {loading ? (
          <p className="pm-dim">Discovering…</p>
        ) : printers.length === 0 ? (
          <p className="pm-dim">
            No physical printers detected{agentReachable ? '' : ' — the local printer agent is offline'}.
          </p>
        ) : (
          printers.map((p) => {
            const isSel = selected?.mode === 'real' && selected?.id === p.id;
            return (
              <div key={p.id} className={`pm-device ${isSel ? 'selected' : ''}`}>
                <div className="pm-device-main">
                  <span className={`pm-dot ${p.status === 'online' ? 'green' : p.status === 'offline' ? 'red' : 'gray'}`} />
                  <span className="pm-device-name">{p.name}</span>
                  <span className="pm-type real">REAL</span>
                  <span className="pm-device-status">{p.status}</span>
                </div>
                <button className="sk-btn ghost" onClick={() => selectReal(p)} disabled={isSel}>
                  {isSel ? 'Selected' : 'Select'}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Demo printers — explicit, clearly labelled. A dropdown lets the
          shopkeeper pick between the available simulated devices. */}
      <div className="pm-section">
        <p className="sk-section-label">Demo Mode (no physical hardware)</p>
        {demoPrinters.length > 0 ? (
          <div className="pm-demo-select">
            <select
              className="pm-select"
              aria-label="Select a demo printer"
              value={demoChoiceId}
              onChange={(e) => setDemoChoiceId(e.target.value)}
            >
              {demoPrinters.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <span className="pm-type demo">DEMO</span>
            <button
              className="sk-btn ghost"
              onClick={() => selectDemo(demoChoice)}
              disabled={selected?.mode === 'demo' && selected?.id === demoChoiceId}
            >
              {selected?.mode === 'demo' && selected?.id === demoChoiceId ? 'Selected' : 'Select Demo'}
            </button>
          </div>
        ) : (
          <p className="pm-dim">No demo devices available.</p>
        )}
        <p className="pm-dim pm-demo-note">
          Demo printers simulate configuration and submission. They never print physical paper.
        </p>
      </div>

      {/* Selected device details */}
      <div className="pm-section">
        <p className="sk-section-label">Selected Device</p>
        {noneSelected ? (
          <div className="sk-warn-box"><AlertTriangle size={14} /> <span>Select a printer to continue.</span></div>
        ) : (
          <div className="pm-selected">
            <div className="pm-selected-head">
              <Plug size={14} />
              <strong>{selected.name}</strong>
              <span className={`pm-type ${selected.mode === 'demo' ? 'demo' : 'real'}`}>
                {selected.mode === 'demo' ? 'DEMO' : 'REAL'}
              </span>
            </div>
            <div className="pm-cap-grid">
              <span>Connection</span><span>{selected.status || 'unknown'}</span>
              <span>Colour</span><span>{capText(selected.capabilities?.supportsColor)}</span>
              <span>Double-sided</span><span>{capText(selected.capabilities?.supportsDuplex)}</span>
              <span>Paper</span><span>{(selected.capabilities?.paperSizes || []).join(', ') || 'unknown'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pm-actions">
        <button className="sk-btn ghost" onClick={discover} disabled={loading}>
          <Plug size={14} /> Test Connection
        </button>
        <button
          className="sk-btn primary"
          onClick={runTest}
          disabled={noneSelected || testing}
          title={noneSelected ? 'Select a printer first' : 'Run a document-free agent configuration test'}
        >
          {testing ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />}
          {testing ? 'Testing…' : 'Test Agent Configuration'}
        </button>
      </div>

      {/* Test result + cursor-driven step replay (real adapter events) */}
      {(testResult || testError) && (
        <div className="pm-test" ref={stageRef}>
          {testError && (
            <div className="sk-error-box"><AlertTriangle size={14} /> <span>{testError}</span></div>
          )}
          {testResult && (
            <>
              <div className="pm-test-head">
                <span className={`pm-type ${testResult.isDemo ? 'demo' : 'real'}`}>
                  {testResult.isDemo ? 'DEMO' : 'REAL'}
                </span>
                {testResult.ok ? (
                  <span className="pm-badge online"><CheckCircle2 size={13} /> {testResult.isDemo ? 'Demo configuration verified' : 'Configuration verified'}</span>
                ) : (
                  <span className="pm-badge offline"><XCircle size={13} /> Configuration failed</span>
                )}
              </div>
              <div className="pm-steps">
                {(testResult.steps || []).map((s, i) => {
                  const done = i < cursorStep || (testResult.ok && i <= cursorStep);
                  const active = i === cursorStep;
                  const failedHere = !testResult.ok && i === (testResult.steps.length - 1) && active;
                  return (
                    <div key={i} className={`pm-step ${active ? 'active' : ''} ${done ? 'done' : ''} ${failedHere ? 'failed' : ''}`} data-field={s.field}>
                      <span className="pm-step-k">{FIELD_LABEL[s.field] || s.field}</span>
                      {s.value !== undefined && <span className="pm-step-v">{String(s.value)}</span>}
                      {active && <MousePointer2 size={16} className="pm-cursor" color="#fff" fill="#2563EB" />}
                    </div>
                  );
                })}
              </div>
              {!testResult.ok && testResult.error && (
                <div className="sk-error-box" style={{ marginTop: 8 }}>
                  <AlertTriangle size={14} />
                  <div><strong>{testResult.error.message}</strong><div className="pm-dim">Code: {testResult.error.code}</div></div>
                </div>
              )}
              {testResult.warnings?.length > 0 && (
                <div className="sk-warn-box" style={{ marginTop: 8 }}>
                  <AlertTriangle size={14} />
                  <ul>{testResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}
              <p className="pm-dim" style={{ marginTop: 8 }}>
                This configuration test does not edit any document{testResult.isDemo ? ' and never prints physical paper' : ' and does not submit a print job'}.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

function capText(v) {
  if (v === true) return 'Supported';
  if (v === false) return 'Not supported';
  return 'Unknown';
}

export default PrinterManagement;
