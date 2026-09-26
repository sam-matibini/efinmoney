// Create a Request Money link — no escrow; third party pays into requester wallet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  isLiveRequestMoneyCurrency,
  minRequestAmount,
} from "../_shared/moneyRequestPaid.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode(len = 7) {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHA[buf[i] % ALPHA.length];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Not authenticated" }, 401);
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const amount = Number(body?.amount);
  const currency = String(body?.currency ?? "CAD").toUpperCase();
  const walletId = String(body?.wallet_id ?? "").trim();
  const note = String(body?.note ?? "").trim().slice(0, 280) || null;
  const payerHint = String(body?.payer_hint_name ?? "").trim().slice(0, 120) || null;
  const days = Math.min(30, Math.max(1, Number(body?.expires_days) || 7));

  if (!isLiveRequestMoneyCurrency(currency)) {
    return json({
      error: `Request Money supports NGN, GHS, KES, ZMW, CAD, and USD. Got ${currency}.`,
    }, 400);
  }
  const minAmt = minRequestAmount(currency);
  if (!Number.isFinite(amount) || amount < minAmt) {
    return json({ error: `Minimum request is ${minAmt.toFixed(2)} ${currency}` }, 400);
  }
  if (!walletId) return json({ error: "wallet_id required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: rl } = await admin.rpc("check_rate_limit", {
    p_key: `money_request_create:${userId}`,
    p_max_requests: 20,
    p_window_seconds: 60,
  });
  if (rl === false) return json({ error: "Too many requests, slow down" }, 429);

  const { data: wallet, error: wErr } = await admin
    .from("wallets")
    .select("id, user_id, currency_code, status")
    .eq("id", walletId)
    .maybeSingle();
  if (wErr || !wallet) return json({ error: "Wallet not found" }, 404);
  if (wallet.user_id !== userId) return json({ error: "Not your wallet" }, 403);
  if (String(wallet.currency_code).toUpperCase() !== currency) {
    return json({ error: "Wallet currency mismatch" }, 400);
  }
  if (wallet.status !== "active") return json({ error: `Wallet not active (${wallet.status})` }, 400);

  let shortCode = "";
  for (let i = 0; i < 5; i++) {
    const candidate = makeCode(7);
    const { data: exists } = await admin
      .from("money_requests")
      .select("id")
      .eq("short_code", candidate)
      .maybeSingle();
    if (!exists) {
      shortCode = candidate;
      break;
    }
  }
  if (!shortCode) return json({ error: "Could not generate code" }, 500);

  const baseUrl = String(body?.base_url || req.headers.get("origin") || "https://efin.money").replace(/\/$/, "");
  const shortUrl = `${baseUrl}/pay/${shortCode}`;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data: row, error: insErr } = await admin
    .from("money_requests")
    .insert({
      requester_id: userId,
      requester_wallet_id: walletId,
      amount: Math.round(amount * 100) / 100,
      currency,
      short_code: shortCode,
      short_url: shortUrl,
      status: "pending",
      note,
      payer_hint_name: payerHint,
      expires_at: expiresAt,
    })
    .select("id, short_code, short_url, amount, currency, status, note, payer_hint_name, expires_at, created_at")
    .single();

  if (insErr || !row) return json({ error: insErr?.message || "Could not create request" }, 500);

  return json({ ok: true, request: row });
});
