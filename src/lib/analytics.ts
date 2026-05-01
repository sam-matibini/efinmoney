import posthog from "posthog-js";

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  const key = "phc_zHNNgGYc5C2xLdvnmfszNcqcKRE2btWTGDAVpzw8zcRz";
  posthog.init(key, {
    api_host: "https://us.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    person_profiles: "identified_only",
  });
  initialized = true;
}

export function identifyUser(userId: string, traits?: Record<string, any>) {
  if (!initialized) return;
  posthog.identify(userId, traits);
}

export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

export function track(event: string, props?: Record<string, any>) {
  if (!initialized) return;
  posthog.capture(event, props);
}
