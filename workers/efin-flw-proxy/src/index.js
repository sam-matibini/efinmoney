/**
 * eFin Flutterwave reverse proxy (V3 + V4)
 *
 * Same method as before: Supabase Edge has no fixed egress IP, so payouts
 * go through this Worker; Flutterwave whitelists the Worker egress IP.
 *
 * Routes:
 *   /v3/*              → https://api.flutterwave.com/v3/*
 *   /*  (everything else) → https://f4bexperience.flutterwave.com/*
 *
 * Deploy (Cloudflare account that owns efin-flw-proxy.ukwenzyb.workers.dev):
 *   cd workers/efin-flw-proxy
 *   npx wrangler deploy
 *
 * Then set on Supabase:
 *   FLW_PROXY_URL=https://efin-flw-proxy.ukwenzyb.workers.dev
 *   FLW_V4_PROXY_URL=https://efin-flw-proxy.ukwenzyb.workers.dev
 */
const V3_UPSTREAM = "https://api.flutterwave.com";
const V4_UPSTREAM = "https://f4bexperience.flutterwave.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return Response.json({
        service: "efin-flw-proxy",
        v3: `${V3_UPSTREAM}/v3`,
        v4: V4_UPSTREAM,
        hint: "Forward /v3/* to Flutterwave V3; all other paths to V4 live API",
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    const isV3 = url.pathname === "/v3" || url.pathname.startsWith("/v3/");
    const upstreamBase = isV3 ? V3_UPSTREAM : V4_UPSTREAM;
    const target = new URL(url.pathname + url.search, upstreamBase);

    const headers = new Headers(request.headers);
    headers.delete("host");

    const init = { method: request.method, headers, redirect: "follow" };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }

    const res = await fetch(target.toString(), init);
    const outHeaders = new Headers(res.headers);
    outHeaders.set("x-efin-flw-proxy", isV3 ? "v3" : "v4");
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders,
    });
  },
};
