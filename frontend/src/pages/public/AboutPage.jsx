import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Smartphone, ShieldCheck, Cpu } from 'lucide-react';
import PublicPageLayout from '../../components/PublicPageLayout';

const AboutPage = () => {
  const navigate = useNavigate();
  return (
    <PublicPageLayout title="About" wide>
      <span className="pubpage-eyebrow">About</span>
      <h1 className="pubpage-title">
        Making physical document services <span className="pubpage-gradient">as simple as digital ones</span>
      </h1>
      <p className="pubpage-lede">
        PrintX is building a simpler bridge between customers and local print shops by turning
        document preparation and printing into an intelligent, guided workflow.
      </p>

      <h2>Why we&rsquo;re building PrintX</h2>
      <p>
        Getting a document printed the way you want still involves a surprising amount of manual
        coordination — finding a shop, sending files over chat apps, explaining edits by hand,
        re-sending corrections, and describing print settings. PrintX replaces that back-and-forth
        with one reviewable workflow: upload, describe, preview, approve, print.
      </p>

      <h2>What PrintX is today</h2>
      <div className="pubpage-grid">
        <div className="pubpage-card">
          <span className="card-icon"><Cpu size={22} /></span>
          <h3>A working product</h3>
          <p>A live customer app, an AI document workflow, and a shopkeeper dashboard.</p>
        </div>
        <div className="pubpage-card">
          <span className="card-icon"><ShieldCheck size={22} /></span>
          <h3>Privacy-first</h3>
          <p>Documents are processed for the print job, not turned into a permanent profile.</p>
        </div>
        <div className="pubpage-card">
          <span className="card-icon"><Smartphone size={22} /></span>
          <h3>Mobile-first</h3>
          <p>An installable web app so you can send a print job from your phone.</p>
        </div>
      </div>

      <h2 id="for-print-shops">For print shops</h2>
      <p>
        PrintX turns incoming print requests into an organized workflow. Instead of scattered
        messages, shops get a dashboard of incoming jobs with the customer&rsquo;s instructions,
        AI-assisted preparation, and a clear print configuration step before anything is printed.
      </p>
      <ul>
        <li>Centralized incoming jobs with live updates.</li>
        <li>AI-assisted document instructions and preview.</li>
        <li>Print configuration with multiple printer support.</li>
        <li>A demo printer for hardware-free demonstrations.</li>
        <li>Google-authenticated shopkeeper access.</li>
      </ul>
      <div className="pubpage-cta-row">
        <a className="pubpage-btn primary" href="/shopkeeper/login"><Store size={16} /> Shopkeeper Login</a>
        <button className="pubpage-btn ghost" onClick={() => navigate('/workspace')}>Try PrintX as a customer</button>
      </div>

      <h2>Our vision</h2>
      <p>
        We want physical document services to feel as effortless as the digital tools people use
        every day — guided, transparent, and respectful of your documents.
      </p>
    </PublicPageLayout>
  );
};

export default AboutPage;
