import React, { useEffect, useState } from 'react';
import { Download, Share, Plus, X, Check, MoreVertical } from 'lucide-react';
import {
  installMode,
  promptInstall,
  subscribeInstall,
} from '../services/pwaInstall';
import '../styles/install.css';

/**
 * "Install PrintX" affordance for the customer landing page.
 *
 * HONEST by design — it renders NOTHING unless a real install path exists:
 *   - Chromium: a button that fires the REAL beforeinstallprompt.
 *   - iOS Safari: a button that opens genuine Share -> Add to Home Screen steps.
 *   - Already installed / unsupported: renders nothing (no fake button).
 *
 * Props:
 *   variant   - 'solid' (default) | 'ghost' styling
 *   className - extra classes for layout
 */
const InstallPrintX = ({ variant = 'solid', className = '' }) => {
  const [mode, setMode] = useState(() => installMode());
  const [iosOpen, setIosOpen] = useState(false);
  const [androidOpen, setAndroidOpen] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const update = () => setMode(installMode());
    const unsub = subscribeInstall(update);
    // Re-evaluate when returning to the tab (e.g. after installing).
    window.addEventListener('visibilitychange', update);
    return () => {
      unsub();
      window.removeEventListener('visibilitychange', update);
    };
  }, []);

  const handleClick = async () => {
    if (mode === 'ios') {
      setIosOpen(true);
      return;
    }
    if (mode === 'android') {
      // A native prompt may have arrived since first render; prefer it.
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setInstalled(true);
        setMode(installMode());
        return;
      }
      if (outcome === 'dismissed') {
        setMode(installMode());
        return;
      }
      // No native prompt available on this Android browser -> show steps.
      setAndroidOpen(true);
      return;
    }
    if (mode === 'prompt') {
      const outcome = await promptInstall();
      if (outcome === 'accepted') setInstalled(true);
      setMode(installMode());
    }
  };

  // Nothing honest to offer -> render nothing (unless we just succeeded).
  if (mode === 'none' && !installed) return null;

  if (installed) {
    return (
      <span className={`install-printx installed ${className}`}>
        <Check size={18} /> PrintX installed
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`install-printx ${variant} ${className}`}
        onClick={handleClick}
        aria-haspopup={mode === 'ios' || mode === 'android' ? 'dialog' : undefined}
      >
        <Download size={18} />
        <span>Install PrintX</span>
      </button>

      {iosOpen && (
        <div
          className="install-ios-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Install PrintX on iPhone or iPad"
          onClick={() => setIosOpen(false)}
        >
          <div className="install-ios-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="install-ios-head">
              <h3>Add PrintX to your Home Screen</h3>
              <button className="install-ios-close" onClick={() => setIosOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="install-ios-sub">
              iOS installs web apps from Safari’s Share menu:
            </p>
            <ol className="install-ios-steps">
              <li>
                <Share size={16} /> Tap the <strong>Share</strong> button in Safari’s toolbar.
              </li>
              <li>
                <Plus size={16} /> Choose <strong>Add to Home Screen</strong>.
              </li>
              <li>
                <Check size={16} /> Tap <strong>Add</strong> — PrintX appears on your Home Screen.
              </li>
            </ol>
            <p className="install-ios-note">
              This option is available in Safari. Some in-app browsers don’t support it.
            </p>
          </div>
        </div>
      )}

      {androidOpen && (
        <div
          className="install-ios-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Install PrintX on Android"
          onClick={() => setAndroidOpen(false)}
        >
          <div className="install-ios-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="install-ios-head">
              <h3>Add PrintX to your Home Screen</h3>
              <button className="install-ios-close" onClick={() => setAndroidOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="install-ios-sub">
              On Android, install PrintX from the browser menu:
            </p>
            <ol className="install-ios-steps">
              <li>
                <MoreVertical size={16} /> Tap the <strong>⋮ menu</strong> in Chrome’s toolbar.
              </li>
              <li>
                <Plus size={16} /> Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
              </li>
              <li>
                <Check size={16} /> Tap <strong>Install</strong> — PrintX appears on your Home Screen.
              </li>
            </ol>
            <p className="install-ios-note">
              Open PrintX in Chrome for the full install option. Some in-app browsers don’t support it.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallPrintX;
