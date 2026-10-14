import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Customer (public) pages
import Home from "./pages/Home";
import Workspace from "./pages/Workspace";

// Public content pages (landing/marketing — no app logic)
import PrivacyPage from "./pages/public/PrivacyPage";
import TermsPage from "./pages/public/TermsPage";
import AboutPage from "./pages/public/AboutPage";
import ContactPage from "./pages/public/ContactPage";
import HowItWorksPage from "./pages/public/HowItWorksPage";
import SecurityPage from "./pages/public/SecurityPage";

// Shopkeeper pages
import ShopkeeperLogin from "./pages/ShopkeeperLogin";
import ShopkeeperDashboard from "./pages/shopkeeper/Dashboard";
import ShopkeeperWorkspace from "./pages/shopkeeper/Workspace";
import ShopkeeperSubscriptions from "./pages/shopkeeper/Subscriptions";
import ShopkeeperAccount from "./pages/shopkeeper/Account";
import RequireShopkeeperAuth from "./components/shopkeeper/RequireShopkeeperAuth";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* ---------- Customer routes (PUBLIC — no login) ---------- */}
          <Route path="/" element={<Home />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/shop/:shopId" element={<Workspace />} />

          {/* ---------- Shopkeeper routes ---------- */}
          <Route path="/shopkeeper/login" element={<ShopkeeperLogin />} />
          <Route
            path="/shopkeeper/dashboard"
            element={
              <RequireShopkeeperAuth>
                <ShopkeeperDashboard />
              </RequireShopkeeperAuth>
            }
          />
          <Route
            path="/shopkeeper/workspace"
            element={
              <RequireShopkeeperAuth>
                <ShopkeeperWorkspace />
              </RequireShopkeeperAuth>
            }
          />
          <Route
            path="/shopkeeper/subscriptions"
            element={
              <RequireShopkeeperAuth>
                <ShopkeeperSubscriptions />
              </RequireShopkeeperAuth>
            }
          />
          <Route
            path="/shopkeeper/account"
            element={
              <RequireShopkeeperAuth>
                <ShopkeeperAccount />
              </RequireShopkeeperAuth>
            }
          />

          {/* ---------- Public content pages (marketing/legal) ---------- */}
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/security" element={<SecurityPage />} />

          {/* ---------- Legacy path redirects ---------- */}
          <Route path="/shopkeeper-login" element={<Navigate to="/shopkeeper/login" replace />} />
          <Route path="/shopkeeper-dashboard" element={<Navigate to="/shopkeeper/dashboard" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
