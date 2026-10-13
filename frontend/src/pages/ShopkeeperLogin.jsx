import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Lock, AlertTriangle } from 'lucide-react';
import { login, loginWithFirebase } from '../services/shopkeeperService';
import { isConfigured, signInWithGoogle } from '../services/firebaseAuth';
import PrintXLogo from '../components/PrintXLogo';
import '../styles/shopkeeper.css';

const ShopkeeperLogin = () => {
  const navigate = useNavigate();
  const firebaseOn = isConfigured();
  const [credentials, setCredentials] = useState({
    shopName: '',
    password: ''
  });
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState(null);

  const handleLogin = (e) => {
    e.preventDefault();

    // Mock authentication (demo) — isolated in shopkeeperService.
    login({ shopName: credentials.shopName });

    // Navigate to the shopkeeper dashboard (new route group).
    navigate('/shopkeeper/dashboard');
  };

  const handleGoogle = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      const user = await signInWithGoogle();
      // Record a local profile (the BACKEND is the real authority: it verifies
      // the ID token + allowlist on every protected call). If this account is
      // not an authorized shopkeeper, backend calls return 403 and the UI shows
      // the honest error — the dashboard renders but privileged actions fail.
      loginWithFirebase({ email: user.email, name: user.name });
      navigate('/shopkeeper/dashboard');
    } catch (err) {
      setAuthError('Google sign-in failed or was cancelled. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="shopkeeper-login-page">
      <div className="login-container">
        <div className="login-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <PrintXLogo size={48} />
          </div>
          <p className="login-subtitle">Shopkeeper Portal</p>
        </div>

        {firebaseOn && (
          <div className="login-form" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="login-button"
              onClick={handleGoogle}
              disabled={signingIn}
            >
              <LogIn size={20} />
              <span>{signingIn ? 'Signing in…' : 'Sign in with Google'}</span>
            </button>
            {authError && (
              <p className="login-note" style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <AlertTriangle size={14} /> {authError}
              </p>
            )}
            <p className="login-note">
              Only authorized PrintX Lab shopkeeper accounts can access the dashboard.
            </p>
          </div>
        )}

        {!firebaseOn && (
        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">
              <User size={18} />
              <span>Shop Name</span>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter your shop name"
              value={credentials.shopName}
              onChange={(e) => setCredentials({ ...credentials, shopName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <Lock size={18} />
              <span>Password</span>
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter password (demo only)"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
            />
          </div>

          <button type="submit" className="login-button">
            <LogIn size={20} />
            <span>Login to Dashboard</span>
          </button>

          <p className="login-note">
            💡 Local dev fallback (Firebase not configured). Set REACT_APP_FIREBASE_* to require Google sign-in.
          </p>
        </form>
        )}

        <button className="back-to-home" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
      </div>

      <div className="login-background">
        <div className="bg-gradient-1"></div>
        <div className="bg-gradient-2"></div>
      </div>
    </div>
  );
};

export default ShopkeeperLogin;
