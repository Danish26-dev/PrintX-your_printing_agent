import React from 'react';
import { Upload, MessageSquare, Eye, CheckCircle, Printer } from 'lucide-react';
import '../styles/solution.css';

const Solution = () => {
  const steps = [
    {
      icon: <Upload size={32} />,
      title: 'Upload',
      description: 'Send a PDF or DOCX to PrintsX Lab from your browser or phone.',
      status: 'active',
    },
    {
      icon: <MessageSquare size={32} />,
      title: 'Describe',
      description: 'Tell PrintsX the edits and print settings in plain language.',
      status: 'active',
    },
    {
      icon: <Eye size={32} />,
      title: 'Preview',
      description: 'PrintsX prepares the document and shows you a preview to review.',
      status: 'active',
    },
    {
      icon: <CheckCircle size={32} />,
      title: 'Approve',
      description: 'Confirm the result and send the job to the shop for printing.',
      status: 'active',
    },
    {
      icon: <Printer size={32} />,
      title: 'Print',
      description: 'The shop receives the job and completes the configured print workflow.',
      status: 'completed',
    },
  ];

  return (
    <section id="solution" className="solution-section">
      <div className="solution-container">
        <div className="section-header">
          <span className="section-label">The Solution</span>
          <h2 className="section-title">
            One guided workflow <br />
            <span className="text-gradient">from upload to print</span>
          </h2>
          <p className="section-description">
            PrintX turns document preparation and print instructions into a single, reviewable flow
            — for both the customer and the shop.
          </p>
        </div>

        <div className="solution-timeline">
          {steps.map((step, index) => (
            <div key={index} className="timeline-step" style={{ animationDelay: `${index * 0.15}s` }}>
              <div className="step-connector">
                <div className={`step-icon-wrapper ${step.status}`}>{step.icon}</div>
              </div>

              <div className="step-content">
                <h3 className="step-title">{step.title}</h3>
                <p className="step-description">{step.description}</p>
              </div>

              <div className="step-number">0{index + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Solution;
