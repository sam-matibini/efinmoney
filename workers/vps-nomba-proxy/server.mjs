/**
 * Minimal Nomba API reverse proxy for a VPS with a static IPv4.
 *
 * Why: Supabase Edge has no fixed egress IP. Cloudflare Workers often egress IPv6-only.
 * Nomba production requires up to 3 whitelisted IPv4 addresses.
 *
 * Flow: Supabase nomba-payout → this proxy (static VPS IP) → https://api.nomba.com
 *
 * Setup (Ubuntu VPS):
 *   1. Note VPS public IPv4 from provider dashboard → email Nomba to whitelist it.
 *   2. curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
 *   3. sudo apt install -y nodejs
 *   4. cd workers/vps-nomba-proxy && npm install
 *   5. PROXY_SECRET=$(openssl rand -hex 24) PORT=8787 node server.mjs
 *   6. Optional: nginx + certbot for https://nomba-proxy.yourdomain.com
 *
 * Supabase secret:
 *   NOMBA_API_BASE=http://YOUR_VPS_IPV4:8787/nomba
 *   NOMBA_PROXY_SECRET=same-as-PROXY_SECRET
 *
 * Discover egress IP (what Nomba will see):
 *   curl http://YOUR_VPS_IPV4:8787/egress-ip
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const PROXY_SECRET = (process.env.PROXY_SECRET || process.env.NOMBA_PROXY_SECRET || "").trim();
const LIVE_UPSTREAM = (process.env.NOMBA_UPSTREAM || "https://api.nomba.com").replace(/\/+$/, "");
const SANDBOX_UPSTREAM = (process.env.NOMBA_SANDBOX_UPSTREAM || "https://sandbox.nomba.com").replace(/\/+$/, "");

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function pickUpstream(pathname) {
  if (pathname.startsWith("/nomba-sandbox")) {
    return { upstream: SANDBOX_UPSTREAM, strip: "/nomba-sandbox" };
  }
  return { upstream: LIVE_UPSTREAM, strip: "/nomba" };
}

function proxyRequest(req, res, upstreamBase, stripPrefix) {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  let path = url.pathname;
  if (stripPrefix && path.startsWith(stripPrefix)) {
    path = path.slice(stripPrefix.length) || "/";
  }
  const target = new URL(path + url.search, upstreamBase);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  headers.host = target.host;
  // Node lowercases incoming headers — Nomba expects camelCase accountId.
  const accountHeader = req.headers.accountid || req.headers.accountId;
  if (accountHeader) headers.accountId = accountHeader;

  const lib = target.protocol === "https:" ? https : http;
  const upstreamReq = lib.request(
    target,
    { method: req.method, headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstreamReq.on("error", (err) => {
    json(res, 502, { error: err.message, upstream: target.toString() });
  });
  req.pipe(upstreamReq);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    return json(res, 200, { ok: true, service: "vps-nomba-proxy" });
  }

  if (req.method === "GET" && url.pathname === "/egress-ip") {
    try {
      const ip = await new Promise((resolve, reject) => {
        https.get("https://ipv4.icanhazip.com", (r) => {
          let body = "";
          r.on("data", (c) => { body += c; });
          r.on("end", () => resolve(body.trim()));
        }).on("error", reject);
      });
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        return json(res, 502, { ok: false, error: "Could not resolve IPv4", raw: ip });
      }
      return json(res, 200, {
        ok: true,
        ip,
        note: "Send this IPv4 to Nomba (docs@nomba.com) with account ID ffcbaa10-608c-44cc-8c41-0d6c232ad636",
        nomba_live_prefix: `/nomba → ${LIVE_UPSTREAM}`,
      });
    } catch (err) {
      return json(res, 502, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (PROXY_SECRET) {
    const got = (req.headers["x-proxy-secret"] || req.headers["x-nomba-proxy-secret"] || "").trim();
    if (got !== PROXY_SECRET) {
      return json(res, 401, { error: "Unauthorized" });
    }
  }

  if (
    url.pathname === "/nomba"
    || url.pathname.startsWith("/nomba/")
    || url.pathname === "/nomba-sandbox"
    || url.pathname.startsWith("/nomba-sandbox/")
  ) {
    const { upstream, strip } = pickUpstream(url.pathname);
    return proxyRequest(req, res, upstream, strip);
  }

  return json(res, 404, { error: "Not found. Use /nomba/* or /nomba-sandbox/*" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`vps-nomba-proxy listening on :${PORT}`);
  console.log(`egress check: http://127.0.0.1:${PORT}/egress-ip`);
});
