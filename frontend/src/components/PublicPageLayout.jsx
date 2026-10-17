import React, { useEffect } from 'react';
import Navigation from './Navigation';
import Footer from './Footer';
import '../styles/public-pages.css';

/**
 * Shared shell for PrintX public content pages (privacy, terms, about,
 * contact, how-it-works, security). Reuses the existing Navigation + Footer so
 * these pages feel like part of the same product. Sets the document title and
 * scrolls to top on mount.
 */
const PublicPageLayout = ({ title, wide = false, children }) => {
  useEffect(() => {
    if (title) document.title = `${title} — PrintsX`;
    window.scrollTo(0, 0);
    return () => {
      document.title = 'PrintsX — Intelligent Printing, Simplified';
    };
  }, [title]);

  return (
    <div className="pubpage">
      <Navigation />
      <main className={`pubpage-main ${wide ? 'pubpage-wide' : ''}`}>{children}</main>
      <Footer />
    </div>
  );
};

export default PublicPageLayout;
