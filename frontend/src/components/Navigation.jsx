import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import PrintXLogo from './PrintXLogo';
import '../styles/navigation.css';

const Navigation = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Navigate to a landing section from ANY page. On the home page we smooth
  // scroll directly; elsewhere we go to '/' and pass the target in router state
  // so Home scrolls to it after it mounts (the sections only exist on home).
  const goToSection = (id) => {
    setMenuOpen(false);
    if (location.pathname === '/') {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate('/', { state: { scrollTo: id } });
    }
  };

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
        <Link to="/" className="nav-logo" onClick={closeMenu} aria-label="PrintsX home">
          <PrintXLogo size={32} />
        </Link>

        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <button type="button" className="nav-link nav-link-btn" onClick={() => goToSection('features')}>Product</button>
          <button type="button" className="nav-link nav-link-btn" onClick={() => goToSection('how-it-works')}>How it works</button>
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
            Try PrintsX
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
            Try PrintsX
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
