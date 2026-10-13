import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, MonitorPlay, CreditCard, User, LogOut } from 'lucide-react';
import { getShopkeeper, logout } from '../../services/shopkeeperService';
import { signOutShopkeeper } from '../../services/firebaseAuth';
import PrintXLogo from '../PrintXLogo';
import '../../styles/shopkeeper-app.css';

const NAV = [
  { to: '/shopkeeper/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/shopkeeper/workspace', label: 'Workspace', icon: MonitorPlay },
  { to: '/shopkeeper/subscriptions', label: 'Subscriptions', icon: CreditCard },
];

/**
 * Persistent shopkeeper shell: left sidebar + top bar + content slot.
 * Used by all authenticated shopkeeper pages.
 */
const ShopkeeperLayout = ({ title, subtitle, actions, children, contentClassName = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const shopkeeper = getShopkeeper();

  const handleLogout = () => {
    logout();
    // Also sign out of Firebase + clear the ID token (no-op if not configured).
    void signOutShopkeeper();
    navigate('/shopkeeper/login');
  };

  return (
    <div className="sk-shell">
      <aside className="sk-sidebar">
        <div className="sk-brand">
          <PrintXLogo size={34} />
          <div style={{ marginLeft: 'auto' }}>
            <p className="sk-brand-role">Shopkeeper</p>
          </div>
        </div>

        <nav className="sk-nav">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <button
                key={to}
                className={`sk-nav-item ${active ? 'active' : ''}`}
                onClick={() => navigate(to)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sk-nav-bottom">
          <button
            className={`sk-nav-item ${location.pathname === '/shopkeeper/account' ? 'active' : ''}`}
            onClick={() => navigate('/shopkeeper/account')}
          >
            <User size={18} />
            <span>Account</span>
          </button>
          <button className="sk-nav-item danger" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="sk-main">
        <div className="sk-topbar">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div>{actions}</div>
        </div>
        <div className={`sk-content ${contentClassName}`}>{children}</div>
      </div>
    </div>
  );
};

export default ShopkeeperLayout;
