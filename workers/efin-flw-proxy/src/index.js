/**
 * eFin Flutterwave + Fincra reverse proxy
 *
 * Same method: Supabase Edge has no fixed egress IP, so payouts go through
 * this Worker; providers whitelist the Worker egress IP (discover via /egress-ip).
 *
 * Routes:
 *   /v3/*                         → https://api.flutterwave.com/v3/*
 *   /fincra/*                     → https://api.fincra.com/*
 *   /fincra-sandbox/*             → https://sandboxapi.fincra.com/*
 *   /nomba/*                      → https://api.nomba.com/*
 *   /nomba-sandbox/*              → https://sandbox.nomba.com/*
 *   /webhooks/lenhub-flutter      → Supabase lenhub-flutter-webhook
 *   /egress-ip                    → public IP Fincra/FLW will see from this Worker
 *   /*  (everything else)         → https://f4bexperience.flutterwave.com/*
 *
 * Deploy:
 *   cd workers/efin-flw-proxy
 *   npx wrangler deploy
 *
 * Supabase secrets:
 *   FLW_PROXY_URL=https://efin-flw-proxy.ukwenzyb.workers.dev
 *   FINCRA_BASE_URL=https://efin-flw-proxy.ukwenzyb.workers.dev/fincra
 *   NOMBA_API_BASE=https://efin-flw-proxy.ukwenzyb.workers.dev/nomba
 *   (keep FINCRA_ENV=live)
 *
 * Nomba production IP whitelist (no self-service dashboard):
 *   Email docs@nomba.com with the IPv4 from /egress-ip (max 3 addresses).
 *
 * Fincra dashboard → IP Whitelisting:
 *   GET https://efin-flw-proxy.ukwenzyb.workers.dev/egress-ip
 *   whitelist the returned "ip" (replace 127.0.0.1; keep at most 2–3 slots)
 */
const V3_UPSTREAM = "https://api.flutterwave.com";
const V4_UPSTREAM = "https://f4bexperience.flutterwave.com";
const FINCRA_LIVE_UPSTREAM = "https://api.fincra.com";
const FINCRA_SANDBOX_UPSTREAM = "https://sandboxapi.fincra.com";
const NOMBA_LIVE_UPSTREAM = "https://api.nomba.com";
const NOMBA_SANDBOX_UPSTREAM = "https://sandbox.nomba.com";
const LENHUB_WEBHOOK_UPSTREAM =
  "https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/lenhub-flutter-webhook";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

async function proxyTo(request, upstreamBase, stripPrefix) {
  const url = new URL(request.url);
  let path = url.pathname;
  if (stripPrefix && path.startsWith(stripPrefix)) {
    path = path.slice(stripPrefix.length) || "/";
  }
  const target = new URL(path + url.search, upstreamBase);

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init = { method: request.method, headers, redirect: "follow" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const res = await fetch(target.toString(), init);
  const outHeaders = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) outHeaders.set(k, v);
  return { res, outHeaders, target: target.toString() };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return Response.json({
        service: "efin-flw-proxy",
        v3: `${V3_UPSTREAM}/v3`,
        v4: V4_UPSTREAM,
        fincra: "/fincra/* → api.fincra.com",
        fincra_sandbox: "/fincra-sandbox/* → sandboxapi.fincra.com",
        nomba: "/nomba/* → api.nomba.com",
        nomba_sandbox: "/nomba-sandbox/* → sandbox.nomba.com",
        egress_ip: "/egress-ip",
        lenhub_webhook: "/webhooks/lenhub-flutter",
        hint: "Whitelist /egress-ip on Fincra + Nomba (email docs@nomba.com); set FINCRA_BASE_URL / NOMBA_API_BASE on Supabase",
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    // Discover the public IP Cloudflare uses when this Worker calls out.
    // Prefer IPv4 — Fincra IP Whitelisting only accepts dotted-quad addresses.
    if (url.pathname === "/egress-ip") {
      try {
        const ipv4Res = await fetch("https://ipv4.icanhazip.com", {
          cf: { cacheTtl: 0 },
        });
        const ipv4 = (await ipv4Res.text()).trim();
        let ipv6 = null;
        try {
          const ipv6Res = await fetch("https://api64.ipify.org?format=json", {
            cf: { cacheTtl: 0 },
          });
          const j = await ipv6Res.json();
          if (j?.ip && String(j.ip).includes(":")) ipv6 = j.ip;
        } catch {
          /* optional */
        }
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ipv4)) {
          return Response.json({
            ok: !!ipv6,
            ip: null,
            ipv6: ipv6 || ipv4,
            error: ipv6 ? undefined : "Could not resolve IPv4 or IPv6 egress",
            note: ipv6
              ? "Cloudflare Worker egress is IPv6-only. Send ipv6 to Nomba for whitelist, or use Oracle/VPS for IPv4."
              : "No egress IP detected.",
            nomba_note: ipv6
              ? `Nomba whitelist candidate (IPv6): ${ipv6}`
              : undefined,
            fincra_note: "Fincra requires IPv4 — use a VPS proxy for Fincra if needed.",
          }, { status: ipv6 ? 200 : 502 });
        }
        return Response.json({
          ok: true,
          ip: ipv4,
          ipv6,
          note: "Whitelist the IPv4 \"ip\" on Fincra (not ipv6). Cloudflare may rotate it — re-check if ACCESS_DENIED returns.",
          fincra_note:
            "If only ipv6 is available from this Worker, Fincra cannot whitelist it. Use your VPS IPv4 (e.g. 37.27.38.44) as the Fincra reverse proxy, or temporarily whitelist 0.0.0.0 for testing.",
        });
      } catch (e) {
        return Response.json(
          { ok: false, error: e instanceof Error ? e.message : String(e) },
          { status: 502 },
        );
      }
    }

    // Lenhub Flutterwave callbacks — public façade (not a raw supabase.co URL)
    if (
      url.pathname === "/webhooks/lenhub-flutter" ||
      url.pathname.startsWith("/webhooks/lenhub-flutter/")
    ) {
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.set("x-efin-webhook-proxy", "lenhub-flutter");

      // MUST be "manual": webhook returns 302 → efin.money after 3DS.
      // "follow" would consume the redirect server-side and leave the browser
      // stuck on this worker URL (with eFin HTML body / blank page).
      const init = {
        method: request.method,
        headers,
        redirect: "manual",
      };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = await request.arrayBuffer();
      }

      const target = LENHUB_WEBHOOK_UPSTREAM + url.search;
      const res = await fetch(target, init);

      // Pass browser redirects straight through to the client.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("Location");
        if (location) {
          const outHeaders = new Headers();
          outHeaders.set("Location", location);
          outHeaders.set("x-efin-webhook-proxy", "lenhub-flutter");
          for (const [k, v] of Object.entries(corsHeaders)) outHeaders.set(k, v);
          return new Response(null, { status: res.status, headers: outHeaders });
        }
      }

      const outHeaders = new Headers(res.headers);
      outHeaders.set("x-efin-webhook-proxy", "lenhub-flutter");
      for (const [k, v] of Object.entries(corsHeaders)) outHeaders.set(k, v);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
      });
    }

    // Fincra live
    if (url.pathname === "/fincra" || url.pathname.startsWith("/fincra/")) {
      const { res, outHeaders } = await proxyTo(request, FINCRA_LIVE_UPSTREAM, "/fincra");
      outHeaders.set("x-efin-proxy", "fincra-live");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
      });
    }

    // Fincra sandbox
    if (
      url.pathname === "/fincra-sandbox" ||
      url.pathname.startsWith("/fincra-sandbox/")
    ) {
      const { res, outHeaders } = await proxyTo(
        request,
        FINCRA_SANDBOX_UPSTREAM,
        "/fincra-sandbox",
      );
      outHeaders.set("x-efin-proxy", "fincra-sandbox");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
      });
    }

    // Nomba live (api.nomba.com) — Supabase Edge has no static IP; whitelist /egress-ip with Nomba.
    if (url.pathname === "/nomba" || url.pathname.startsWith("/nomba/")) {
      const { res, outHeaders } = await proxyTo(request, NOMBA_LIVE_UPSTREAM, "/nomba");
      outHeaders.set("x-efin-proxy", "nomba-live");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
      });
    }

    // Nomba sandbox
    if (url.pathname === "/nomba-sandbox" || url.pathname.startsWith("/nomba-sandbox/")) {
      const { res, outHeaders } = await proxyTo(
        request,
        NOMBA_SANDBOX_UPSTREAM,
        "/nomba-sandbox",
      );
      outHeaders.set("x-efin-proxy", "nomba-sandbox");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
      });
    }

    const isV3 = url.pathname === "/v3" || url.pathname.startsWith("/v3/");
    const upstreamBase = isV3 ? V3_UPSTREAM : V4_UPSTREAM;
    const { res, outHeaders } = await proxyTo(request, upstreamBase, null);
    outHeaders.set("x-efin-flw-proxy", isV3 ? "v3" : "v4");
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders,
    });
  },
};
