import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

Sentry.init({
  dsn: "https://cf659b68e29e63fb6c0eed8a877be05b@o4511304461844480.ingest.us.sentry.io/4511304468070400",
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,
  environment: import.meta.env.MODE,
});

import ChunkErrorFallback from "./components/ChunkErrorFallback.tsx";

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<ChunkErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>
);
