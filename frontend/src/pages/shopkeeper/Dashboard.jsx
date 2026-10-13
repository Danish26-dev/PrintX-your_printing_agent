import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Printer, Cpu, Briefcase, CheckCircle2, Clock, XCircle, MonitorPlay } from 'lucide-react';
import ShopkeeperLayout from '../../components/shopkeeper/ShopkeeperLayout';
import PrinterManagement from '../../components/shopkeeper/PrinterManagement';
import {
  isAcceptingOrders,
  setAcceptingOrders,
  isAgentActive,
  getShopkeeper,
} from '../../services/shopkeeperService';
import { getOverview, getActiveJob, getRecentJobs } from '../../services/jobsService';
import { getPrinterStatus, STATUS_LABELS } from '../../services/printerService';
import { getSelectedDevice, subscribeSelectedDevice } from '../../services/selectedDeviceService';

// Human-readable labels for the real backend job statuses.
const STATUS_TEXT = {
  UPLOADED: 'Uploaded',
  PROCESSING: 'Processing',
  CONFIGURING_PRINTER: 'Configuring printer',
  READY_FOR_PREVIEW: 'Ready for preview',
  READY_FOR_APPROVAL: 'Ready for approval',
  APPROVED: 'Approved',
  NEEDS_CLARIFICATION: 'Needs clarification',
  PRINT_COMMAND_SUBMITTED: 'Print submitted',
  PRINT_SUBMITTED: 'Print submitted',
  PRINTED: 'Printed',
  PROCESSING_FAILED: 'Failed',
  CONVERSION_FAILED: 'Failed',
  PRINT_FAILED: 'Print failed',
};

const relTime = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} hr ago`;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(isAcceptingOrders());
  const shopkeeper = getShopkeeper();
  const [overview, setOverview] = useState({ activeJobs: 0, completedJobs: 0, pendingJobs: 0, failedJobs: 0, totalJobs: 0 });
  const [activeJob, setActiveJob] = useState(null);
  const [recent, setRecent] = useState([]);
  const [printer, setPrinter] = useState({ name: 'Unknown', status: 'unknown', real: false });
  const [selectedDevice, setSelectedDevice] = useState(getSelectedDevice());
  const agentOn = isAgentActive();
  const isDemoSelected = selectedDevice?.mode === 'demo';

  useEffect(() => subscribeSelectedDevice(setSelectedDevice), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [ov, aj, rj, pr] = await Promise.all([
        getOverview(),
        getActiveJob(),
        getRecentJobs(),
        getPrinterStatus(),
      ]);
      if (!cancelled) {
        setOverview(ov);
        setActiveJob(aj);
        setRecent(rj);
        setPrinter(pr);
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const toggleAccepting = () => {
    const next = !accepting;
    setAccepting(next);
    setAcceptingOrders(next);
  };

  // Honest stats only — counts truly derived from real jobs. No revenue/totals.
  const stats = [
    { label: 'Active Jobs', value: overview.activeJobs, icon: Briefcase },
    { label: 'Completed', value: overview.completedJobs, icon: CheckCircle2 },
    { label: 'Pending', value: overview.pendingJobs, icon: Clock },
    { label: 'Failed', value: overview.failedJobs, icon: XCircle },
  ];

  return (
    <ShopkeeperLayout
      title={shopkeeper?.shopName || 'PrintX Lab'}
      subtitle="Operational overview"
    >
      {/* A. Order acceptance control */}
      <div className={`sk-order-control ${accepting ? 'online' : 'offline'}`}>
        <div className="sk-order-left">
          <h2>Accepting Orders</h2>
          <div className="sk-order-state">
            <span className={`sk-dot ${accepting ? 'green' : 'red'}`}></span>
            {accepting ? 'ONLINE' : 'NOT ACCEPTING ORDERS'}
          </div>
          <p className="sk-order-sub">
            {accepting
              ? 'Customers can currently send print jobs to your shop.'
              : 'Your shop is currently unavailable for new print requests.'}
          </p>
        </div>
        <button
          className={`sk-switch ${accepting ? 'on' : ''}`}
          onClick={toggleAccepting}
          aria-label="Toggle accepting orders"
        >
          <span className="sk-switch-knob" />
        </button>
      </div>

      {/* A. Status chips — three DISTINCT healths: overall app agent, the
          selected device (demo adapter or real printer), and the physical
          printer agent. Demo mode is NEVER marked offline because the physical
          agent is unavailable. */}
      <div className="sk-status-row">
        <div className="sk-status-chip">
          <Cpu size={18} color={agentOn ? '#22C55E' : '#6B7280'} />
          <span className="label">Agent</span>
          <span className="value" style={{ color: agentOn ? '#22C55E' : '#9CA3AF' }}>
            {agentOn ? 'Active' : 'Sleeping'}
          </span>
        </div>

        {isDemoSelected ? (
          <>
            <div className="sk-status-chip">
              <Printer size={18} color="#F59E0B" />
              <span className="label">Selected Device</span>
              <span className="value">
                {selectedDevice.name} · <span className="pm-type demo" style={{ marginLeft: 2 }}>DEMO</span>
              </span>
            </div>
            <div className="sk-status-chip">
              <Activity size={18} color="#22C55E" />
              <span className="label">Demo Adapter</span>
              <span className="value" style={{ color: '#22C55E' }}>READY</span>
            </div>
            <div className="sk-status-chip">
              <Printer size={18} color="#6B7280" />
              <span className="label">Physical Printer Agent</span>
              <span className="value" style={{ color: '#9CA3AF' }}>
                {printer.real ? (STATUS_LABELS?.[printer.status] || printer.status) : 'Offline — not required for demo'}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="sk-status-chip">
              <Printer size={18} color={printer.status === 'online' ? '#22C55E' : printer.status === 'offline' ? '#EF4444' : '#F59E0B'} />
              <span className="label">{selectedDevice ? 'Selected Printer' : 'Printer'}</span>
              <span className="value">
                {selectedDevice ? selectedDevice.name : printer.name} · {STATUS_LABELS?.[printer.status] || printer.status}
                {!printer.real && ' (agent offline)'}
              </span>
            </div>
            <div className="sk-status-chip">
              <Activity size={18} color={accepting ? '#22C55E' : '#EF4444'} />
              <span className="label">Shop</span>
              <span className="value">{accepting ? 'Accepting' : 'Paused'}</span>
            </div>
          </>
        )}
      </div>

      {/* Printers & Devices — connect/select a real printer or the Demo Printer */}
      <PrinterManagement />

      {/* B. Today's overview — real counts */}
      <div>
        <p className="sk-section-label">Live Overview (real jobs)</p>
        <div className="sk-grid cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <div className="sk-stat" key={label}>
              <div className="sk-stat-icon"><Icon size={18} /></div>
              <p className="sk-stat-value">{value}</p>
              <p className="sk-stat-label">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="sk-grid cols-2">
        {/* C. Active job (real) */}
        <div className="sk-card sk-active-job">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="sk-card-title" style={{ margin: 0 }}>Active Job</h3>
            <button className="sk-btn ghost" onClick={() => navigate('/shopkeeper/workspace')}>
              <MonitorPlay size={16} /> Open Workspace
            </button>
          </div>
          {activeJob ? (
            <>
              <p className="doc-name">
                {activeJob.document}{' '}
                <span style={{ color: '#6B7280', fontWeight: 400 }}>· {activeJob.id.slice(0, 16)}…</span>
              </p>
              {activeJob.instruction && <div className="sk-request">"{activeJob.instruction}"</div>}
              <div style={{ marginTop: 10, fontSize: 13, color: '#9CA3AF' }}>
                Status: {STATUS_TEXT[activeJob.status] || activeJob.status}
              </div>
            </>
          ) : (
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>No active job right now.</p>
          )}
        </div>

        {/* D. Recent jobs (real) */}
        <div className="sk-card">
          <h3 className="sk-card-title">Recent Jobs</h3>
          {recent.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>No jobs yet.</p>
          ) : (
            <table className="sk-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Copies</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((j) => (
                  <tr key={j.id}>
                    <td>
                      {j.document}
                      <div style={{ fontSize: 12, color: '#6B7280' }}>{j.id.slice(0, 14)}…</div>
                    </td>
                    <td>
                      <span className={`sk-badge ${j.status.toLowerCase()}`}>
                        {STATUS_TEXT[j.status] || j.status}
                      </span>
                    </td>
                    <td>{j.copies}</td>
                    <td style={{ color: '#9CA3AF' }}>{relTime(j.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ShopkeeperLayout>
  );
};

export default Dashboard;
