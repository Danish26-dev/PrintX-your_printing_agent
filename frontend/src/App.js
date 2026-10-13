import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Customer (public) pages
import Home from "./pages/Home";
import Workspace from "./pages/Workspace";

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
