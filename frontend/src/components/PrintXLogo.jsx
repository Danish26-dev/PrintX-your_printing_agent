import React from 'react';

// Use the web-optimized logo from /public (≈21 KB) rather than importing the
// 1.2 MB source PNG into the JS bundle. The optimized asset is generated from
// src/assets/printx-logo.png by scripts/gen_logo_assets.py.
const logoUrl = `${process.env.PUBLIC_URL || ''}/logo.png`;

/**
 * The single, reusable PrintX logo used across the entire app (customer +
 * shopkeeper, landing + login). It renders the REAL brand logo asset
 * (src/assets/printx-logo.png) — not a CSS recreation and with no text baked
 * into the image. The "PrintX" wordmark is rendered as adjacent text so it
 * stays crisp at every size and respects the light/dark variant.
 *
 * Props (unchanged API so every existing usage updates automatically):
 *   size      - logo mark height in px (wordmark scales with it). Default 32.
 *   showText  - render the "PrintX" wordmark next to the mark. Default true.
 *   variant   - 'light' (default, for dark backgrounds) | 'dark'
 *   className  - extra classes for layout
 */
const PrintXLogo = ({ size = 32, showText = true, variant = 'light', className = '' }) => {
  const textColor = variant === 'dark' ? '#0B0F19' : '#E5E7EB';

  return (
    <span
      className={`printx-logo ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3 }}
    >
      <img
        src={logoUrl}
        alt="PrintsX"
        width={size}
        height={size}
        style={{ height: size, width: 'auto', objectFit: 'contain', display: 'block' }}
        decoding="async"
      />

      {showText && (
        <span
          style={{
            fontWeight: 800,
            fontSize: size * 0.6,
            letterSpacing: '0.3px',
            color: textColor,
            fontFamily: 'Inter, system-ui, sans-serif',
            lineHeight: 1,
          }}
        >
          Prints<span style={{ color: '#7C3AED' }}>X</span>
        </span>
      )}
    </span>
  );
};

export default PrintXLogo;
