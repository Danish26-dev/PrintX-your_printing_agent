import React from 'react';
import { FileText, MessageSquare, Settings, Rocket } from 'lucide-react';
import '../styles/howitworks.css';

const HowItWorks = () => {
  const steps = [
    {
      icon: <FileText size={32} />,
      number: '01',
      title: 'Upload Your Document',
      description: 'Drag and drop your files or paste a link. Supports PDF, Word, images, and more.'
    },
    {
      icon: <MessageSquare size={32} />,
      number: '02',
      title: 'Give Instructions',
      description: 'Tell our AI what you need in plain English. Resize, rotate, adjust margins, or complex edits.'
    },
    {
      icon: <Settings size={32} />,
      number: '03',
      title: 'AI Processes',
      description: 'Our autonomous agent edits your document, prepares print-ready files, and optimizes for quality.'
    },
    {
      icon: <Rocket size={32} />,
      number: '04',
      title: 'Print & Delete',
      description: 'Your document prints automatically. Files are permanently deleted within minutes for privacy.'
    }
  ];

  return (
    <section id="how-it-works" className="howitworks-section">
      <div className="howitworks-container">
        <div className="section-header">
          <span className="section-label">How It Works</span>
          <h2 className="section-title">
            Four simple steps to <br />
            <span className="text-gradient">autonomous printing</span>
          </h2>
        </div>

        <div className="steps-horizontal">
          {steps.map((step, index) => (
            <div key={index} className="step-card" style={{ animationDelay: `${index * 0.12}s` }}>
              <div className="step-number-badge">{step.number}</div>
              
              <div className="step-icon-container">
                {step.icon}
              </div>
              
              <h3 className="step-card-title">{step.title}</h3>
              <p className="step-card-description">{step.description}</p>
              
              {index < steps.length - 1 && (
                <div className="step-arrow">→</div>
              )}
            </div>
          ))}
        </div>

        <div className="cta-final">
          <h3 className="cta-title">Ready to automate your printing?</h3>
          <p className="cta-subtitle">Join thousands of users who've eliminated manual printing workflows</p>
          <button className="btn-primary cta-button" onClick={() => {}}>
            Start Free Trial
          </button>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
