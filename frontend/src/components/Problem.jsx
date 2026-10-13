import React from 'react';
import { Clock, ShieldAlert, Edit3 } from 'lucide-react';
import '../styles/problem.css';

const Problem = () => {
  const problems = [
    {
      icon: <Edit3 size={32} />,
      title: 'Manual Editing',
      description: 'Print shops require manual file adjustments, leading to errors and miscommunication.',
      impact: 'Time-consuming process'
    },
    {
      icon: <ShieldAlert size={32} />,
      title: 'Privacy Risks',
      description: 'Sensitive documents are exposed to multiple handlers, creating security vulnerabilities.',
      impact: 'Data breach potential'
    },
    {
      icon: <Clock size={32} />,
      title: 'Long Wait Times',
      description: 'Queue management and manual processing cause unnecessary delays in urgent situations.',
      impact: 'Hours of waiting'
    }
  ];

  return (
    <section id="problem" className="problem-section">
      <div className="problem-container">
        <div className="section-header">
          <span className="section-label">The Problem</span>
          <h2 className="section-title">
            Why traditional printing <br />
            <span className="text-gradient">needs to evolve</span>
          </h2>
          <p className="section-description">
            Current document printing workflows are broken, slow, and insecure
          </p>
        </div>

        <div className="problems-grid">
          {problems.map((problem, index) => (
            <div key={index} className="problem-card" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="problem-icon-wrapper">
                {problem.icon}
              </div>
              
              <h3 className="problem-title">{problem.title}</h3>
              <p className="problem-description">{problem.description}</p>
              
              <div className="problem-impact">
                <span className="impact-badge">{problem.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Problem;
