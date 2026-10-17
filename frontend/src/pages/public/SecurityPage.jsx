import React from 'react';
import { LogIn, UserCheck, SplitSquareHorizontal, Server, ShieldCheck, Eye } from 'lucide-react';
import PublicPageLayout from '../../components/PublicPageLayout';

const items = [
  { icon: <LogIn size={22} />, title: 'Authenticated shopkeeper access', body: 'Print-shop operators sign in with Google Sign-In to reach the shopkeeper dashboard.' },
  { icon: <UserCheck size={22} />, title: 'Controlled authorization', body: 'Access to shopkeeper features is authorized, not open to anyone who finds the URL.' },
  { icon: <SplitSquareHorizontal size={22} />, title: 'Separated experiences', body: 'The public customer workflow and the shopkeeper workflow are kept distinct.' },
  { icon: <Server size={22} />, title: 'Access-controlled backend', body: 'Operations that act on behalf of a shop are protected on the backend.' },
  { icon: <Eye size={22} />, title: 'Review before printing', body: 'A preview and explicit approval step sit between editing and printing.' },
  { icon: <ShieldCheck size={22} />, title: 'Privacy-first architecture', body: 'Documents are processed for the print job rather than retained as a profile.' },
];

const SecurityPage = () => (
  <PublicPageLayout title="Security" wide>
    <span className="pubpage-eyebrow">Security</span>
    <h1 className="pubpage-title">
      Security &amp; <span className="pubpage-gradient">access control</span>
    </h1>
    <p className="pubpage-lede">
      PrintsX separates the customer and shopkeeper experiences and controls access to shop
      operations. Below is an honest summary of what is implemented today.
    </p>

    <div className="pubpage-grid">
      {items.map((it, i) => (
        <div className="pubpage-card" key={i}>
          <span className="card-icon">{it.icon}</span>
          <h3>{it.title}</h3>
          <p>{it.body}</p>
        </div>
      ))}
    </div>

    <h2>What we do not claim</h2>
    <p>
      We use a privacy-first architecture, but we do not claim formal certifications such as ISO,
      SOC 2, GDPR, or HIPAA compliance, and we are not affiliated with, endorsed by, or certified by
      any cloud provider. If and when any certification is obtained, it will be stated here with
      details.
    </p>

    <h2>Reporting a concern</h2>
    <p>
      If you believe you have found a security issue, please contact us at contact@printsx.in
      so we can look into it.
    </p>
  </PublicPageLayout>
);

export default SecurityPage;
