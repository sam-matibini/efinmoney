// Create a Payment Link payout: escrows funds from sender wallet to 2199 Payouts Pending Claim
// and returns a short URL the recipient can claim.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const amount = Number(body?.amount);
  const currency: string = String(body?.currency ?? "CAD").toUpperCase();
  const senderWalletId: string | null = body?.sender_wallet_id ?? null;
  const recipientName: string | null = body?.recipient_name ?? null;
  const recipientNote: string | null = body?.recipient_note ?? null;
  const source: "send" | "invoice" = body?.source === "invoice" ? "invoice" : "send";
  const sourceRef: string | null = body?.source_ref ?? null;

  if (!Number.isFinite(amount) || amount <= 0) return json({ error: "amount must be > 0" }, 400);
  if (!/^[A-Z]{3}$/.test(currency)) return json({ error: "invalid currency" }, 400);
  if (!senderWalletId) return json({ error: "sender_wallet_id required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Rate-limit
  const { data: rl } = await admin.rpc("check_rate_limit", {
    p_key: `payment_link_create:${userId}`,
    p_max_requests: 20,
    p_window_seconds: 60,
  });
  if (rl === false) return json({ error: "Too many requests, slow down" }, 429);

  // Verify wallet ownership + currency
  const { data: wallet, error: wErr } = await admin
    .from("wallets")
    .select("id,user_id,currency_code,status")
    .eq("id", senderWalletId)
    .maybeSingle();
  if (wErr || !wallet) return json({ error: "Wallet not found" }, 404);
  if (wallet.user_id !== userId) return json({ error: "Not your wallet" }, 403);
  if (wallet.currency_code !== currency) return json({ error: "Wallet currency mismatch" }, 400);
  if (wallet.status !== "active") return json({ error: `Wallet not active (${wallet.status})` }, 400);

  // Balance check
  const { data: balRow } = await admin.rpc("get_wallet_balance", { p_wallet_id: senderWalletId });
  const balance = Number(balRow ?? 0);
  if (balance < amount) return json({ error: "Insufficient balance" }, 400);

  // Find COA accounts
  const { data: walletLiab } = await admin
    .from("ledger_accounts")
    .select("id")
    .like("code", "21%")
    .neq("code", "2199")
    .eq("currency_code", currency)
    .limit(1)
    .maybeSingle();
  const { data: pendingLiab } = await admin
    .from("ledger_accounts")
    .select("id")
    .eq("code", "2199")
    .eq("currency_code", currency)
    .maybeSingle();
  if (!walletLiab?.id || !pendingLiab?.id) {
    return json({ error: `Missing ledger accounts for ${currency}` }, 500);
  }

  // Generate unique short code (6 chars, retry on collision)
  const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function makeCode(len = 7) {
    const buf = crypto.getRandomValues(new Uint8Array(len));
    let s = "";
    for (let i = 0; i < len; i++) s += ALPHA[buf[i] % ALPHA.length];
    return s;
  }
  let shortCode = "";
  for (let i = 0; i < 5; i++) {
    const candidate = makeCode(7);
    const { data: exists } = await admin
      .from("payment_link_payouts")
      .select("id")
      .eq("short_code", candidate)
      .maybeSingle();
    if (!exists) { shortCode = candidate; break; }
  }
  if (!shortCode) return json({ error: "Could not generate code" }, 500);

  // Post escrow journal: DR wallet liability / CR 2199 pending claim
  const journalId = crypto.randomUUID();
  const entries = [
    {
      journal_id: journalId,
      account_id: walletLiab.id,
      wallet_id: senderWalletId,
      currency_code: currency,
      debit_amount: amount,
      credit_amount: 0,
      description: `Payment Link escrow [${shortCode}]`,
      reference_type: "payment_link",
      reference_id: shortCode,
      created_by: userId,
    },
    {
      journal_id: journalId,
      account_id: pendingLiab.id,
      wallet_id: null,
      currency_code: currency,
      debit_amount: 0,
      credit_amount: amount,
      description: `Payment Link escrow [${shortCode}]`,
      reference_type: "payment_link",
      reference_id: shortCode,
      created_by: userId,
    },
  ];
  const { error: ledErr } = await admin.from("ledger_entries").insert(entries);
  if (ledErr) return json({ error: `Ledger error: ${ledErr.message}` }, 500);

  const baseUrl = body?.base_url || req.headers.get("origin") || "https://efin.money";
  const shortUrl = `${baseUrl.replace(/\/$/, "")}/claim/${shortCode}`;

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: row, error: insErr } = await admin
    .from("payment_link_payouts")
    .insert({
      sender_id: userId,
      sender_wallet_id: senderWalletId,
      source,
      source_ref: sourceRef,
      amount,
      currency,
      recipient_name: recipientName,
      recipient_note: recipientNote,
      short_code: shortCode,
      short_url: shortUrl,
      escrow_journal_id: journalId,
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (insErr) return json({ error: insErr.message }, 500);

  return json({
    success: true,
    id: row.id,
    code: shortCode,
    url: shortUrl,
    expires_at: row.expires_at,
  });
});
