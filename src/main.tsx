import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import { AppDataProvider } from "./context/AppDataContext";
import { AuthProvider } from "./context/AuthContext";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL. Configure Convex before running the app.");
}
const convexClient = new ConvexReactClient(convexUrl);

function Root() {
  const content = (
      <React.StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <AppDataProvider>
              <App />
            </AppDataProvider>
          </AuthProvider>
        </BrowserRouter>
      </React.StrictMode>
    );

  return <ConvexProvider client={convexClient}>{content}</ConvexProvider>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.DEV) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        void Promise.all(registrations.map((registration) => registration.unregister()));
      });
      return;
    }
    void navigator.serviceWorker.register("/sw.js");
  });
}
