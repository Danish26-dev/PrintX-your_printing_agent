import React from 'react';
import { Upload, Brain, Printer, Trash2, CheckCircle } from 'lucide-react';
import '../styles/solution.css';

const Solution = () => {
  const steps = [
    {
      icon: <Upload size={32} />,
      title: 'Upload',
      description: 'Securely upload documents through encrypted channels',
      status: 'active'
    },
    {
      icon: <Brain size={32} />,
      title: 'AI Understands',
      description: 'AI agent analyzes and interprets your instructions',
      status: 'active'
    },
    {
      icon: <Printer size={32} />,
      title: 'Smart Edit & Print',
      description: 'Automated editing and print-ready file preparation',
      status: 'active'
    },
    {
      icon: <CheckCircle size={32} />,
      title: 'Execute',
      description: 'Print job completed with quality assurance',
      status: 'active'
    },
    {
      icon: <Trash2 size={32} />,
      title: 'Auto Delete',
      description: 'Files permanently deleted for privacy',
      status: 'completed'
    }
  ];

  return (
    <section id="solution" className="solution-section">
      <div className="solution-container">
        <div className="section-header">
          <span className="section-label">The Solution</span>
          <h2 className="section-title">
            Autonomous AI workflow <br />
            <span className="text-gradient">from upload to deletion</span>
          </h2>
          <p className="section-description">
            PrintX handles everything automatically while maintaining enterprise-grade security
          </p>
        </div>

        <div className="solution-timeline">
          {steps.map((step, index) => (
            <div key={index} className="timeline-step" style={{ animationDelay: `${index * 0.15}s` }}>
              <div className="step-connector">
                <div className={`step-icon-wrapper ${step.status}`}>
                  {step.icon}
                </div>
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
