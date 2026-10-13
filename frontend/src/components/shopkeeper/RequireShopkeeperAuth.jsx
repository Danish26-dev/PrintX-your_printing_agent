import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../../services/shopkeeperService';
import { isConfigured, onShopkeeperAuth } from '../../services/firebaseAuth';

/**
 * Guards shopkeeper-only routes. Customers are NEVER redirected here — only the
 * /shopkeeper/* routes are wrapped.
 *
 * When Firebase is configured (production), the guard requires a real Firebase
 * sign-in (the backend independently verifies the ID token + allowlist on every
 * protected request — the route guard is NOT the only line of defence). When
 * Firebase is not configured (pure local dev), it falls back to the legacy
 * localStorage flag so local work is unblocked.
 */
const RequireShopkeeperAuth = ({ children }) => {
  const location = useLocation();
  const firebaseOn = isConfigured();
  const [fbUser, setFbUser] = useState(undefined); // undefined = still resolving

  useEffect(() => {
    if (!firebaseOn) return undefined;
    const unsub = onShopkeeperAuth(setFbUser);
    return unsub;
  }, [firebaseOn]);

  if (firebaseOn) {
    if (fbUser === undefined) {
      // Auth state still resolving — render nothing briefly to avoid a flash.
      return null;
    }
    if (!fbUser) {
      return <Navigate to="/shopkeeper/login" replace state={{ from: location.pathname }} />;
    }
    return children;
  }

  // Legacy local fallback (Firebase not configured).
  if (!isAuthenticated()) {
    return <Navigate to="/shopkeeper/login" replace state={{ from: location.pathname }} />;
  }
  return children;
};

export default RequireShopkeeperAuth;
