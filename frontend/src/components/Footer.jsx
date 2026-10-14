import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintXLogo from './PrintXLogo';
import InstallPrintX from './InstallPrintX';
import '../styles/footer.css';

const Footer = () => {
  const navigate = useNavigate();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo-group">
              <PrintXLogo size={36} />
            </div>
            <p className="footer-tagline">Intelligent printing, simplified.</p>
            <div className="footer-cta-group">
              <button className="btn-primary footer-cta" onClick={() => navigate('/workspace')}>
                Try PrintX
              </button>
              {/* Renders only when a real install path exists (Chromium prompt
                  or iOS Share instructions); hidden otherwise. */}
              <InstallPrintX variant="ghost" className="footer-install" />
            </div>
          </div>

          <div className="footer-links-group">
            <div className="footer-column">
              <h4 className="footer-column-title">Product</h4>
              <Link to="/how-it-works" className="footer-link">How it works</Link>
              <Link to="/#features" className="footer-link">Customer workflow</Link>
              <a href="/shopkeeper/login" className="footer-link">For print shops</a>
            </div>

            <div className="footer-column">
              <h4 className="footer-column-title">Company</h4>
              <Link to="/about" className="footer-link">About</Link>
              <Link to="/contact" className="footer-link">Contact</Link>
            </div>

            <div className="footer-column">
              <h4 className="footer-column-title">Trust</h4>
              <Link to="/privacy" className="footer-link">Privacy Policy</Link>
              <Link to="/terms" className="footer-link">Terms of Service</Link>
              <Link to="/security" className="footer-link">Security</Link>
            </div>
          </div>
        </div>

        <div className="footer-divider"></div>

        <div className="footer-bottom">
          <p className="footer-copyright">© {year} PrintX. All rights reserved.</p>
          <p className="footer-note">Privacy-first document and print workflow.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
