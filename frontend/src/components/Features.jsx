import React from 'react';
import { Shield, Cpu, Zap, Lock } from 'lucide-react';
import '../styles/features.css';

const Features = () => {
  const features = [
    {
      image: 'https://images.unsplash.com/photo-1667372283496-893f0b1e7c16?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MTJ8MHwxfHNlYXJjaHwxfHxzZWN1cmUlMjBjbG91ZCUyMHRlY2hub2xvZ3klMjBwcml2YWN5fGVufDB8fHx8MTczNzY2OTA2NHww&ixlib=rb-4.1.0&q=85',
      icon: <Shield size={28} />,
      title: 'Secure Channel Upload',
      description: 'End-to-end encrypted file transfer with military-grade security protocols. Your documents are protected from upload to deletion.',
      benefits: ['256-bit encryption', 'Zero-knowledge architecture', 'Secure socket connections']
    },
    {
      image: 'https://images.unsplash.com/photo-1716436329836-208bea5a55e6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MTJ8MHwxfHNlYXJjaHwyfHxBSSUyMGF1dG9tYXRpb24lMjB0ZWNobm9sb2d5fGVufDB8fHx8MTczNzY2OTA2OXww&ixlib=rb-4.1.0&q=85',
      icon: <Cpu size={28} />,
      title: 'Autonomous AI Agent',
      description: 'Advanced AI understands natural language instructions and executes complex document editing tasks with precision.',
      benefits: ['Natural language processing', 'Context-aware editing', 'Multi-format support']
    },
    {
      image: 'https://images.unsplash.com/photo-1760894942780-2b4b82a42ac3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MTJ8MHwxfHNlYXJjaHwxfHwzRCUyMHByaW50aW5nJTIwdGVjaG5vbG9neXxlbnwwfHx8fDE3Mzc2NjkwNzR8MA&ixlib=rb-4.1.0&q=85',
      icon: <Zap size={28} />,
      title: 'Smart Print Automation',
      description: 'Intelligent print queue management with automatic optimization for quality, speed, and resource efficiency.',
      benefits: ['Auto format conversion', 'Quality optimization', 'Instant processing']
    },
    {
      image: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MTJ8MHwxfHNlYXJjaHw0fHxkYXRhJTIwc2VjdXJpdHklMjBwcml2YWN5fGVufDB8fHx8MTczNzY2OTA3OXww&ixlib=rb-4.1.0&q=85',
      icon: <Lock size={28} />,
      title: 'Privacy-First Execution',
      description: 'Automatic file deletion after printing ensures your sensitive information never stays on our servers longer than necessary.',
      benefits: ['Immediate deletion', 'No data retention', 'Audit trail available']
    }
  ];

  return (
    <section id="features" className="features-section">
      <div className="features-container">
        <div className="section-header">
          <span className="section-label">Features</span>
          <h2 className="section-title">
            Built for security, <br />
            <span className="text-gradient">designed for speed</span>
          </h2>
        </div>

        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="feature-image-wrapper">
                <img 
                  src={feature.image} 
                  alt={feature.title}
                  className="feature-image"
                />
                <div className="feature-overlay"></div>
                <div className="feature-icon-float">
                  {feature.icon}
                </div>
              </div>
              
              <div className="feature-content">
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
