import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { register as registerServiceWorker } from "@/serviceWorkerRegistration";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Make PrintX installable + offline-capable for the app shell (production only;
// a no-op in dev). The SW never caches API responses, documents, or tokens.
registerServiceWorker();
