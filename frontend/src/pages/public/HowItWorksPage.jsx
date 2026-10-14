import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, FileUp, MessageSquare, Eye, CheckCircle, Printer, Inbox, SlidersHorizontal, Cpu } from 'lucide-react';
import PublicPageLayout from '../../components/PublicPageLayout';

const customerSteps = [
  { icon: <Store size={22} />, title: 'Choose a print shop', body: 'Select an available PrintX-enabled shop, such as PrintX Lab.' },
  { icon: <FileUp size={22} />, title: 'Send your document', body: 'Upload a PDF or DOCX from the web app or your phone.' },
  { icon: <MessageSquare size={22} />, title: 'Describe what you need', body: 'State edits and print settings in plain language.' },
  { icon: <Eye size={22} />, title: 'Review the preview', body: 'PrintX prepares the document and shows you the result.' },
  { icon: <CheckCircle size={22} />, title: 'Approve & send', body: 'Confirm and hand the job to the shop.' },
];

const shopSteps = [
  { icon: <Inbox size={22} />, title: 'Receive', body: 'Incoming jobs appear on the shopkeeper dashboard with live updates.' },
  { icon: <SlidersHorizontal size={22} />, title: 'Configure', body: 'Review the requested print settings against the selected printer.' },
  { icon: <Cpu size={22} />, title: 'Process', body: 'The agent walks the configuration through the printer workflow.' },
  { icon: <Printer size={22} />, title: 'Print', body: 'Complete the configured print job (including a demo printer for hardware-free runs).' },
];

const HowItWorksPage = () => {
  const navigate = useNavigate();
  return (
    <PublicPageLayout title="How it works" wide>
      <span className="pubpage-eyebrow">How it works</span>
      <h1 className="pubpage-title">
        From a document to a <span className="pubpage-gradient">print-ready job</span>
      </h1>
      <p className="pubpage-lede">
        PrintX turns document preparation and print instructions into one guided workflow — a
        simple path for the customer and an organized queue for the shop.
      </p>

      <h2>For customers</h2>
      <div className="pubpage-grid">
        {customerSteps.map((s, i) => (
          <div className="pubpage-card" key={i}>
            <span className="card-icon">{s.icon}</span>
            <h3>{`0${i + 1} — ${s.title}`}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>

      <h2 id="for-print-shops">For print shops</h2>
      <div className="pubpage-grid">
        {shopSteps.map((s, i) => (
          <div className="pubpage-card" key={i}>
            <span className="card-icon">{s.icon}</span>
            <h3>{`0${i + 1} — ${s.title}`}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>

      <h2>How the AI fits in</h2>
      <p>
        PrintX uses AI to understand your intent, while the actual document changes are handled by
        deterministic document operations — so edits are predictable and reviewable rather than
        improvised.
      </p>
      <ul>
        <li>Natural language — you describe the edit and print settings.</li>
        <li>Document understanding — the request is interpreted into a concrete plan.</li>
        <li>Deterministic operations — the document engine applies the changes.</li>
        <li>Preview — you review the prepared result before approving.</li>
        <li>Print configuration — settings are verified against the shop&rsquo;s printer.</li>
        <li>Shopkeeper workflow — the shop receives and completes the job.</li>
      </ul>

      <div className="pubpage-cta-row">
        <button className="pubpage-btn primary" onClick={() => navigate('/workspace')}>Try PrintX</button>
        <a className="pubpage-btn ghost" href="/shopkeeper/login">Shopkeeper Login</a>
      </div>
    </PublicPageLayout>
  );
};

export default HowItWorksPage;
