// Public lookup of a money request by short code — used by /pay/:code.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { payMethodsForCurrency } from "../_shared/moneyRequestPaid.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let code = url.searchParams.get("code");
  if (!code && req.method === "POST") {
    try {
      const body = await req.json();
      code = body?.code ?? null;
    } catch {
      code = null;
    }
  }
  if (!code || !/^[A-Z0-9]{4,16}$/i.test(code)) return json({ error: "Invalid code" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  await admin.rpc("check_rate_limit", {
    p_key: `money_req_resolve:${ip}`,
    p_max_requests: 60,
    p_window_seconds: 60,
  });

  const { data: row, error } = await admin
    .from("money_requests")
    .select(
      "id, amount, currency, note, status, expires_at, requester_id, requester_wallet_id, payer_hint_name, payer_name, paid_at, short_code",
    )
    .eq("short_code", String(code).toUpperCase())
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!row) return json({ error: "Link not found" }, 404);

  if (
    (row.status === "pending" || row.status === "awaiting_payment")
    && new Date(row.expires_at).getTime() < Date.now()
  ) {
    await admin.from("money_requests").update({ status: "expired" }).eq("id", row.id);
    row.status = "expired";
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("user_id", row.requester_id)
    .maybeSingle();

  const currency = String(row.currency).toUpperCase();
  let bankVa: {
    bank_name: string;
    account_number: string;
    account_name: string;
    currency_code: string;
  } | null = null;

  if (currency === "NGN" || currency === "GHS") {
    const { data: va } = await admin
      .from("virtual_accounts")
      .select("bank_name, account_number, account_name, currency_code, status")
      .eq("user_id", row.requester_id)
      .eq("currency_code", currency)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (va?.account_number) {
      bankVa = {
        bank_name: String(va.bank_name || "Bank"),
        account_number: String(va.account_number),
        account_name: String(va.account_name || profile?.full_name || "eFinMoney"),
        currency_code: currency,
      };
    }
  }

  const methods = payMethodsForCurrency(currency).filter((m) => {
    if (m === "bank_va") return !!bankVa;
    return true;
  });

  return json({
    code: row.short_code,
    amount: Number(row.amount),
    currency,
    note: row.note,
    status: row.status,
    expires_at: row.expires_at,
    paid_at: row.paid_at,
    payer_hint_name: row.payer_hint_name,
    requester_name: profile?.full_name || "An eFinMoney user",
    requester_avatar: profile?.avatar_url || null,
    pay_methods: methods.length ? methods : payMethodsForCurrency(currency),
    bank_va: bankVa,
  });
});
