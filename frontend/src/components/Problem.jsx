import React from 'react';
import { MessagesSquare, RefreshCw, ShieldQuestion } from 'lucide-react';
import '../styles/problem.css';

const Problem = () => {
  const problems = [
    {
      icon: <MessagesSquare size={32} />,
      title: 'Too many messages',
      description:
        'Finding a shop, sending files over chat apps, and explaining edits by hand turns one print job into a dozen back-and-forth messages.',
      impact: 'Fragmented workflow',
    },
    {
      icon: <RefreshCw size={32} />,
      title: 'Repeated corrections',
      description:
        'A small change means re-sending the file, re-explaining the print settings, and waiting again for confirmation.',
      impact: 'Slow turnaround',
    },
    {
      icon: <ShieldQuestion size={32} />,
      title: 'Document privacy',
      description:
        'Sensitive documents get forwarded through personal chats and shared devices, with little clarity on where the file ends up.',
      impact: 'Privacy concerns',
    },
  ];

  return (
    <section id="problem" className="problem-section">
      <div className="problem-container">
        <div className="section-header">
          <span className="section-label">The Problem</span>
          <h2 className="section-title">
            Printing shouldn&rsquo;t require <br />
            <span className="text-gradient">a dozen messages</span>
          </h2>
          <p className="section-description">
            Getting a document printed the way you want usually means a lot of manual coordination
            between you and the shop.
          </p>
        </div>

        <div className="problems-grid">
          {problems.map((problem, index) => (
            <div key={index} className="problem-card" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="problem-icon-wrapper">{problem.icon}</div>

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
