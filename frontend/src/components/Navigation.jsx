import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import PrintXLogo from './PrintXLogo';
import '../styles/navigation.css';

const Navigation = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
        <div className="nav-logo">
          <PrintXLogo size={32} />
        </div>

        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <a href="#problem" className="nav-link" onClick={closeMenu}>Problem</a>
          <a href="#solution" className="nav-link" onClick={closeMenu}>Solution</a>
          <a href="#features" className="nav-link" onClick={closeMenu}>Features</a>
          <a href="#how-it-works" className="nav-link" onClick={closeMenu}>How It Works</a>
          <a href="/shopkeeper/login" className="nav-link nav-link-login" onClick={closeMenu}>
            Shopkeeper Login
          </a>
        </div>

        <a href="/shopkeeper/login" className="login-btn">
          Shopkeeper Login
        </a>

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
