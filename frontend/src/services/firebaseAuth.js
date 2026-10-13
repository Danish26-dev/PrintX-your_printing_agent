// Firebase Authentication (Google Sign-In) for the SHOPKEEPER portal.
//
// Customers never touch this — the public customer workspace stays open. Only
// the shopkeeper dashboard/operations require sign-in. After sign-in we hand
// the Firebase ID token to the apiClient, which sends it as a Bearer token the
// backend verifies with the Admin SDK.
//
// Config comes from build-time env (REACT_APP_FIREBASE_*). If it is absent
// (e.g. a pure local run without Firebase), the module degrades gracefully:
// isConfigured() returns false and the UI can fall back to the legacy mock.
//
// The Firebase SDK is imported dynamically so a local build without the
// dependency installed still compiles; it is only needed where Google Sign-In
// is actually used.

import { setFirebaseIdToken } from './apiClient';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

let _appPromise = null;
let _authPromise = null;

/** True when the Firebase web config is present (required for Google Sign-In). */
export function isConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

async function getAuth() {
  if (!isConfigured()) throw new Error('Firebase is not configured');
  if (!_authPromise) {
    _authPromise = (async () => {
      const [{ initializeApp, getApps }, authMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
      ]);
      if (!_appPromise) {
        const existing = getApps();
        _appPromise = existing.length ? existing[0] : initializeApp(firebaseConfig);
      }
      const app = await _appPromise;
      const auth = authMod.getAuth(app);
      // Keep the apiClient's ID token fresh as auth state changes.
      authMod.onIdTokenChanged(auth, async (user) => {
        if (user) {
          try {
            setFirebaseIdToken(await user.getIdToken());
          } catch {
            setFirebaseIdToken('');
          }
        } else {
          setFirebaseIdToken('');
        }
      });
      return { auth, authMod };
    })();
  }
  return _authPromise;
}

/** Launch the Google Sign-In popup. Returns the signed-in user's basic info. */
export async function signInWithGoogle() {
  const { auth, authMod } = await getAuth();
  const provider = new authMod.GoogleAuthProvider();
  const result = await authMod.signInWithPopup(auth, provider);
  const token = await result.user.getIdToken();
  setFirebaseIdToken(token);
  return { email: result.user.email, name: result.user.displayName, uid: result.user.uid };
}

/** Sign out and clear the ID token. */
export async function signOutShopkeeper() {
  setFirebaseIdToken('');
  if (!isConfigured()) return;
  try {
    const { auth, authMod } = await getAuth();
    await authMod.signOut(auth);
  } catch {
    /* already signed out / not initialised */
  }
}

/**
 * Subscribe to auth state. Calls cb(user|null). Returns an unsubscribe fn.
 * When Firebase is not configured, immediately reports null and no-ops.
 */
export function onShopkeeperAuth(cb) {
  if (!isConfigured()) {
    cb(null);
    return () => {};
  }
  let unsub = () => {};
  getAuth()
    .then(({ auth, authMod }) => {
      unsub = authMod.onAuthStateChanged(auth, (user) =>
        cb(user ? { email: user.email, name: user.displayName, uid: user.uid } : null),
      );
    })
    .catch(() => cb(null));
  return () => unsub();
}

/** Get a fresh ID token for the current user (or '' if none). */
export async function currentIdToken() {
  if (!isConfigured()) return '';
  try {
    const { auth } = await getAuth();
    const user = auth.currentUser;
    return user ? await user.getIdToken() : '';
  } catch {
    return '';
  }
}
