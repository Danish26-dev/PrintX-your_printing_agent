import React from 'react';
import { Printer, FileText, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../../styles/workspace.css';

const VerticalSidebar = () => {
  const navigate = useNavigate();

  const navItems = [
    { icon: <Printer size={22} />, label: 'Workspace', active: true },
    { icon: <FileText size={22} />, label: 'Jobs', action: () => {} },
    { icon: <Home size={22} />, label: 'Landing Page', action: () => navigate('/') }
  ];

  return (
    <div className="vertical-sidebar">
      <div className="vertical-nav-items">
        {navItems.map((item, index) => (
          <button
            key={index}
            className={`vertical-nav-icon ${item.active ? 'active' : ''}`}
            onClick={item.action}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
};

export default VerticalSidebar;
