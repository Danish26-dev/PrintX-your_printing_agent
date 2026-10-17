import React from 'react';
import { Sparkles, Eye, ShieldCheck, Smartphone, Store, Printer } from 'lucide-react';
import '../styles/features.css';

const Features = () => {
  const features = [
    {
      icon: <Sparkles size={28} />,
      title: 'AI-native workflow',
      description:
        'Describe edits and print requirements in natural language. PrintsX interprets your intent and prepares the job.',
      benefits: ['Plain-language instructions', 'Edit + print settings in one request', 'Guided, not manual'],
    },
    {
      icon: <ShieldCheck size={28} />,
      title: 'Privacy-first processing',
      description:
        'Documents are processed for the requested print workflow rather than becoming a permanent customer profile.',
      benefits: ['Processed for the job at hand', 'Controlled document handling', 'Separated customer & shop views'],
    },
    {
      icon: <Eye size={28} />,
      title: 'Preview before printing',
      description:
        'Review the prepared document before anything is sent to the shop, so there are no surprises on paper.',
      benefits: ['See the edited result', 'Approve explicitly', 'No blind printing'],
    },
    {
      icon: <Smartphone size={28} />,
      title: 'Mobile-first',
      description:
        'Upload and manage print jobs from your phone. PrintsX is an installable web app that works in the browser.',
      benefits: ['Works in the browser', 'Installable PWA', 'Upload from your phone'],
    },
    {
      icon: <Store size={28} />,
      title: 'Shopkeeper workflow',
      description:
        'A dashboard for the print-shop side — receive jobs, review instructions, and configure printing.',
      benefits: ['Centralized incoming jobs', 'Live job updates', 'Google-authenticated access'],
    },
    {
      icon: <Printer size={28} />,
      title: 'Printer-aware',
      description:
        'Configurable print settings and multiple printer support, including a demo printer for hardware-free runs.',
      benefits: ['Copies, colour, paper, sides', 'Multiple printers', 'Demo printer support'],
    },
  ];

  return (
    <section id="features" className="features-section">
      <div className="features-container">
        <div className="section-header">
          <span className="section-label">Why PrintsX</span>
          <h2 className="section-title">
            A real product, <br />
            <span className="text-gradient">built for both sides</span>
          </h2>
          <p className="section-description">
            Everything below is part of the working product — the customer app and the shopkeeper
            workflow.
          </p>
        </div>

        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card feature-card--compact" style={{ animationDelay: `${index * 0.08}s` }}>
              <div className="feature-content">
                <div className="feature-icon-badge">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>

                <ul className="feature-benefits">
                  {feature.benefits.map((benefit, idx) => (
                    <li key={idx} className="benefit-item">
                      <span className="benefit-dot"></span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
