import React from 'react';
import { Mail, Store, Users, LifeBuoy } from 'lucide-react';
import PublicPageLayout from '../../components/PublicPageLayout';

// Honest placeholder contact address. Replace [CONTACT EMAIL] with the real
// business address once it exists. The form uses a mailto fallback so no
// backend endpoint is fabricated.
const CONTACT_EMAIL = '[CONTACT EMAIL]';

const ContactPage = () => {
  const onSubmit = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const subject = encodeURIComponent(`[${data.get('topic') || 'General'}] PrintX enquiry`);
    const body = encodeURIComponent(
      `Name: ${data.get('name') || ''}\nEmail: ${data.get('email') || ''}\n\n${data.get('message') || ''}`,
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <PublicPageLayout title="Contact" wide>
      <span className="pubpage-eyebrow">Contact</span>
      <h1 className="pubpage-title">
        Get in touch with <span className="pubpage-gradient">PrintX</span>
      </h1>
      <p className="pubpage-lede">
        Questions about the product, interested in onboarding your print shop, or exploring a
        partnership? Reach out — we read every message.
      </p>

      <div className="pubpage-grid">
        <div className="pubpage-card">
          <span className="card-icon"><Mail size={22} /></span>
          <h3>Product questions</h3>
          <p>How PrintX works and whether it fits your use case.</p>
        </div>
        <div className="pubpage-card">
          <span className="card-icon"><Store size={22} /></span>
          <h3>Print-shop onboarding</h3>
          <p>Run your shop&rsquo;s incoming jobs through PrintX.</p>
        </div>
        <div className="pubpage-card">
          <span className="card-icon"><Users size={22} /></span>
          <h3>Partnerships</h3>
          <p>Work with us on integrations or pilots.</p>
        </div>
        <div className="pubpage-card">
          <span className="card-icon"><LifeBuoy size={22} /></span>
          <h3>Support</h3>
          <p>Help with an existing print job or account.</p>
        </div>
      </div>

      <h2>Send a message</h2>
      <p className="pubpage-meta">
        Email us directly at {CONTACT_EMAIL}, or use the form below (it opens your email client).
      </p>
      <form className="pubform" onSubmit={onSubmit}>
        <div>
          <label htmlFor="c-name">Name</label>
          <input id="c-name" name="name" type="text" autoComplete="name" required />
        </div>
        <div>
          <label htmlFor="c-email">Email</label>
          <input id="c-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="c-topic">Topic</label>
          <select id="c-topic" name="topic" defaultValue="General">
            <option>General</option>
            <option>Product question</option>
            <option>Print-shop onboarding</option>
            <option>Partnership</option>
            <option>Support</option>
          </select>
        </div>
        <div>
          <label htmlFor="c-message">Message</label>
          <textarea id="c-message" name="message" required />
        </div>
        <button type="submit" className="pubpage-btn primary">Send message</button>
      </form>
    </PublicPageLayout>
  );
};

export default ContactPage;
