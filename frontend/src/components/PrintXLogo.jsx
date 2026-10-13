import React from 'react';

/**
 * The single, reusable PrintX logo used across the entire app (customer +
 * shopkeeper). Self-contained inline SVG — no external/hosted asset, so there
 * is no third-party branding dependency.
 *
 * Props:
 *   size      - icon height in px (wordmark scales with it). Default 32.
 *   showText  - render the "PrintX" wordmark next to the mark. Default true.
 *   variant   - 'light' (default, for dark backgrounds) | 'dark'
 */
const PrintXLogo = ({ size = 32, showText = true, variant = 'light', className = '' }) => {
  const textColor = variant === 'dark' ? '#0B0F19' : '#E5E7EB';
  const gradId = 'printxLogoGrad';

  return (
    <span
      className={`printx-logo ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.32 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="PrintX"
        role="img"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        {/* rounded square badge */}
        <rect width="48" height="48" rx="12" fill={`url(#${gradId})`} />
        {/* printer glyph */}
        <path
          d="M16 14.5h16a1.5 1.5 0 0 1 1.5 1.5v4h-19v-4a1.5 1.5 0 0 1 1.5-1.5Z"
          fill="#fff"
          fillOpacity="0.95"
        />
        <rect x="11.5" y="20" width="25" height="12" rx="2.5" fill="#fff" fillOpacity="0.9" />
        <rect x="16" y="26.5" width="16" height="8" rx="1.5" fill="#2563EB" />
        <rect x="18.5" y="29" width="11" height="1.6" rx="0.8" fill="#fff" />
        <rect x="18.5" y="31.3" width="8" height="1.6" rx="0.8" fill="#fff" />
        <circle cx="31.5" cy="23.5" r="1.3" fill="#7C3AED" />
      </svg>

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
          Print<span style={{ color: '#7C3AED' }}>X</span>
        </span>
      )}
    </span>
  );
};

export default PrintXLogo;
