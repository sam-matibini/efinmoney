import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
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
}

import ChunkErrorFallback from "./components/ChunkErrorFallback.tsx";

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<ChunkErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>
);
