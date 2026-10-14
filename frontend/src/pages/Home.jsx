import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navigation from '../components/Navigation';
import Hero from '../components/Hero';
import Problem from '../components/Problem';
import Solution from '../components/Solution';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import Footer from '../components/Footer';
import '../styles/home.css';

const Home = () => {
  const location = useLocation();

  useEffect(() => {
    // Smooth scroll behavior
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }, []);

  // When arriving from another page (e.g. the navbar "Product"/"How it works"
  // buttons on /privacy), scroll to the requested section once the home page
  // has mounted. Supports both router state and a URL hash (#features).
  useEffect(() => {
    const target = location.state?.scrollTo || (location.hash ? location.hash.slice(1) : null);
    if (!target) return;
    // Defer to the next frame so the sections are in the DOM.
    const t = setTimeout(() => {
      const el = document.getElementById(target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(t);
  }, [location]);

  return (
    <div className="home-container">
      <Navigation />
      <Hero />
      <Problem />
      <Solution />
      <Features />
      <HowItWorks />
      <Footer />
    </div>
  );
};

export default Home;
