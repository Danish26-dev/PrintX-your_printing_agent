import React from 'react';
import { Store, FileUp, MessageSquare, Eye, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../styles/howitworks.css';

const HowItWorks = () => {
  const navigate = useNavigate();

  const steps = [
    {
      icon: <Store size={32} />,
      number: '01',
      title: 'Choose a print shop',
      description: 'Find and select an available PrintsX-enabled shop, such as PrintsX Lab.',
    },
    {
      icon: <FileUp size={32} />,
      number: '02',
      title: 'Send your document',
      description: 'Upload a PDF or DOCX directly from the web app or your phone.',
    },
    {
      icon: <MessageSquare size={32} />,
      number: '03',
      title: 'Describe what you need',
      description:
        'For example: “Replace Rahul Kumar with Danish Ali, 3 copies, A4, black & white, portrait, double-sided.”',
    },
    {
      icon: <Eye size={32} />,
      number: '04',
      title: 'Review before printing',
      description: 'PrintsX prepares the document and shows you a preview to approve.',
    },
    {
      icon: <Printer size={32} />,
      number: '05',
      title: 'Approve & print',
      description: 'The print shop receives the job and completes the configured print workflow.',
    },
  ];

  return (
    <section id="how-it-works" className="howitworks-section">
      <div className="howitworks-container">
        <div className="section-header">
          <span className="section-label">How It Works</span>
          <h2 className="section-title">
            Five simple steps <br />
            <span className="text-gradient">from document to print</span>
          </h2>
        </div>

        <div className="steps-horizontal">
          {steps.map((step, index) => (
            <div key={index} className="step-card" style={{ animationDelay: `${index * 0.12}s` }}>
              <div className="step-number-badge">{step.number}</div>

              <div className="step-icon-container">{step.icon}</div>

              <h3 className="step-card-title">{step.title}</h3>
              <p className="step-card-description">{step.description}</p>

              {index < steps.length - 1 && <div className="step-arrow">→</div>}
            </div>
          ))}
        </div>

        <div className="cta-final">
          <h3 className="cta-title">Ready to try PrintsX?</h3>
          <p className="cta-subtitle">
            Open PrintsX Lab and run a real document through the workflow.
          </p>
          <button className="btn-primary cta-button" onClick={() => navigate('/workspace')}>
            Try PrintsX
          </button>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
