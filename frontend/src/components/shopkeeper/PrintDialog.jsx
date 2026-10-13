import React from 'react';
import { ChevronDown, Minus, Plus, FileText } from 'lucide-react';

/**
 * A realistic, browser/system-style Print dialog used in the Shopkeeper
 * Workspace. It is a faithful VISUAL reproduction — it does NOT control a real
 * system print dialog (browser security forbids that). The agent cursor
 * "operates" it in Demo Mode and the settings below update live.
 *
 * Props:
 *   settings  - { printer, copies, layout, pages, color, paper, scale,
 *                 pagesPerSheet, margins, headersFooters, backgroundGraphics }
 *   active    - the setting key currently being changed (for highlight), or null
 *   job       - active job (for the preview panel)
 *   totalSheets - computed sheet count string
 *   onSystemDialog - optional handler for the "Print using system dialog…" link
 */
const Row = ({ id, label, children, active }) => (
  <div className={`pd2-field ${active === id ? 'hot' : ''}`} data-field={id}>
    <label className="pd2-label">{label}</label>
    {children}
  </div>
);

const Select = ({ value, options }) => (
  <div className="pd2-select">
    <span>{value}</span>
    <ChevronDown size={15} />
    {/* options are illustrative; this is a visual control */}
    <span className="pd2-select-hidden">{options?.join(',')}</span>
  </div>
);

const PrintDialog = ({ settings, active, job, totalSheets, onSystemDialog, printClicked, printerStatus }) => {
  // Reflect the REAL printer availability (never a hardcoded "Online").
  const statusText =
    printerStatus === 'online' ? '● Online' : printerStatus === 'offline' ? '● Offline' : '● Unknown';
  const statusColor =
    printerStatus === 'online' ? '#22C55E' : printerStatus === 'offline' ? '#EF4444' : '#9CA3AF';
  return (
    <div className="pd2">
      {/* Left: document preview */}
      <div className="pd2-preview">
        <div className="pd2-paper">
          <div className="pd2-paper-head">
            <FileText size={14} />
            <span>{job?.document || 'document.pdf'}</span>
          </div>
          <div className="pd2-paper-lines">
            <span style={{ width: '70%' }} />
            <span style={{ width: '95%' }} />
            <span style={{ width: '88%' }} />
            <span style={{ width: '40%' }} />
            <span style={{ width: '92%' }} />
            <span style={{ width: '60%' }} />
            <span style={{ width: '80%' }} />
          </div>
          {job?.replace && (
            <div className="pd2-paper-highlight">{job.replace}</div>
          )}
        </div>
        <p className="pd2-preview-caption">Page 1 of 1</p>
      </div>

      {/* Right: settings */}
      <div className="pd2-settings">
        <div className="pd2-header">
          <h3>Print</h3>
          <p className="pd2-total">{totalSheets}</p>
        </div>

        <Row id="printer" label="Printer" active={active}>
          <div className="pd2-printer">
            <Select value={settings.printer} />
            <span className="pd2-online" style={{ color: statusColor }}>{statusText}</span>
          </div>
        </Row>

        <Row id="copies" label="Copies" active={active}>
          <div className="pd2-copies">
            <button className="pd2-step" tabIndex={-1}><Minus size={14} /></button>
            <span className="pd2-copies-val">{settings.copies}</span>
            <button className="pd2-step" tabIndex={-1}><Plus size={14} /></button>
          </div>
        </Row>

        <Row id="layout" label="Layout" active={active}>
          <div className="pd2-segment">
            <span className={settings.layout === 'Portrait' ? 'on' : ''}>Portrait</span>
            <span className={settings.layout === 'Landscape' ? 'on' : ''}>Landscape</span>
          </div>
        </Row>

        <Row id="pages" label="Pages" active={active}>
          <Select value={settings.pages} options={['All', 'Odd pages only', 'Even pages only', 'Custom']} />
        </Row>

        <Row id="color" label="Color" active={active}>
          <div className="pd2-segment">
            <span className={settings.color === 'Color' ? 'on' : ''}>Color</span>
            <span className={settings.color !== 'Color' ? 'on' : ''}>Black &amp; White</span>
          </div>
        </Row>

        <Row id="sides" label="Sides" active={active}>
          <Select
            value={
              settings.sides === 'one-sided'
                ? 'Single-sided'
                : settings.sides === 'two-sided-short-edge'
                  ? 'Double (short edge)'
                  : settings.sides === 'two-sided-long-edge'
                    ? 'Double (long edge)'
                    : settings.sides || 'Single-sided'
            }
            options={['Single-sided', 'Double (long edge)', 'Double (short edge)']}
          />
        </Row>

        <Row id="paper" label="Paper size" active={active}>
          <Select value={settings.paper} options={['A4', 'Letter', 'Legal']} />
        </Row>

        <Row id="scale" label="Scale" active={active}>
          <Select value={settings.scale} options={['100%', 'Fit to page', 'Custom']} />
        </Row>

        <Row id="pagesPerSheet" label="Pages per sheet" active={active}>
          <Select value={String(settings.pagesPerSheet)} options={['1', '2', '4']} />
        </Row>

        <Row id="margins" label="Margins" active={active}>
          <Select value={settings.margins} options={['Default', 'None', 'Minimum']} />
        </Row>

        <div className="pd2-options">
          <label className="pd2-check">
            <input type="checkbox" checked={settings.headersFooters} readOnly />
            <span>Headers and footers</span>
          </label>
          <label className="pd2-check">
            <input type="checkbox" checked={settings.backgroundGraphics} readOnly />
            <span>Background graphics</span>
          </label>
        </div>

        <button type="button" className="pd2-system-link" onClick={onSystemDialog}>
          Print using system dialog…
        </button>

        <div className="pd2-actions">
          <button type="button" className="pd2-cancel" tabIndex={-1}>Cancel</button>
          <button
            type="button"
            className={`pd2-print ${active === 'print' ? 'hot' : ''} ${printClicked ? 'clicked' : ''}`}
            data-field="print"
            tabIndex={-1}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintDialog;
