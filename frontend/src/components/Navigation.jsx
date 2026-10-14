import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PrintXLogo from './PrintXLogo';
import '../styles/navigation.css';

const Navigation = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className={`navigation ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-content">
        <Link to="/" className="nav-logo" onClick={closeMenu} aria-label="PrintX home">
          <PrintXLogo size={32} />
        </Link>

        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <a href="#features" className="nav-link" onClick={closeMenu}>Product</a>
          <a href="#how-it-works" className="nav-link" onClick={closeMenu}>How it works</a>
          <Link to="/about#for-print-shops" className="nav-link" onClick={closeMenu}>For Print Shops</Link>
          <Link to="/privacy" className="nav-link" onClick={closeMenu}>Privacy</Link>
          <a href="/shopkeeper/login" className="nav-link nav-link-login" onClick={closeMenu}>
            Shopkeeper Login
          </a>
          <button
            type="button"
            className="nav-link nav-link-try"
            onClick={() => { closeMenu(); navigate('/workspace'); }}
          >
            Try PrintX
          </button>
        </div>

        <div className="nav-actions">
          <a href="/shopkeeper/login" className="login-btn">
            Shopkeeper Login
          </a>
          <button
            type="button"
            className="nav-try-btn"
            onClick={() => { closeMenu(); navigate('/workspace'); }}
          >
            Try PrintX
          </button>
        </div>

        <button
          type="button"
          className="nav-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </nav>
  );
};

export default Navigation;
