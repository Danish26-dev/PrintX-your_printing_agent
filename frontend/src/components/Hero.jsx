import React, { Suspense, lazy } from 'react';
import { ArrowRight, Play, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import InstallPrintX from './InstallPrintX';
import '../styles/hero.css';

// Lazy-load the heavy 3D Spline scene so it never blocks first paint / TTI.
// The hero text + CTAs render immediately; the visual streams in after.
const Spline = lazy(() => import('@splinetool/react-spline'));

const Hero = () => {
  const navigate = useNavigate();

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="hero-section">
      <div className="hero-content">
        <div className="hero-left">
          <div className="hero-badge">
            <span className="badge-dot"></span>
            <span className="badge-text">AI-powered document &amp; print workflow</span>
          </div>

          <h1 className="hero-title">
            Print documents without the
            <span className="hero-title-gradient"> printer-side complexity.</span>
          </h1>

          <p className="hero-subtitle">
            Send a document to a print shop, describe the edits and print settings in plain
            language, review the prepared preview, and approve the job. PrintX gives print shops
            an intelligent workflow to receive, configure, and process those jobs.
          </p>

          <div className="hero-cta-group">
            <button className="btn-primary hero-cta" onClick={() => navigate('/workspace')}>
              Try PrintX
              <ArrowRight className="btn-icon" size={20} />
            </button>

            <button className="btn-demo" onClick={() => scrollTo('how-it-works')}>
              <Play size={18} />
              <span>See how it works</span>
            </button>

            {/* Installable PWA: renders only when a real install path exists
                (Chromium prompt or iOS Share instructions); hidden otherwise. */}
            <InstallPrintX variant="ghost" className="hero-install" />
          </div>

          {/* Honest product signals — NOT fabricated metrics. Each reflects a
              capability actually implemented in the product. */}
          <div className="hero-signals">
            <div className="signal-item">
              <Sparkles size={18} className="signal-icon" />
              <span>AI-powered editing</span>
            </div>
            <div className="signal-item">
              <ShieldCheck size={18} className="signal-icon" />
              <span>Privacy-first processing</span>
            </div>
            <div className="signal-item">
              <Store size={18} className="signal-icon" />
              <span>Built for print shops</span>
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="spline-container">
            <Suspense fallback={<div className="spline-fallback" aria-hidden="true" />}>
              <Spline scene="https://prod.spline.design/NbVmy6DPLhY-5Lvg/scene.splinecode" />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="hero-scroll-indicator">
        <div className="scroll-line"></div>
        <span className="scroll-text">Scroll to explore</span>
      </div>
    </section>
  );
};

export default Hero;
