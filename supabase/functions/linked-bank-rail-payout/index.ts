/**
 * Pay a customer-linked bank from a partner rail (Fincra / Nomba) instead of
 * requiring a pre-funded eFinMoney wallet. Cash leaves the partner disbursement
 * wallet over bank-to-bank rails (NUBAN / EFT).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";
import { getNombaApiConfig, nombaApiConfigured } from "../_shared/nomba-api.ts";

type Rail = "fincra" | "nomba";

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fincraAvailable(currency: string): Promise<number> {
  const cfg = getFincraConfig();
  if (!cfg.secretKey) return 0;
  const res = await fincraFetch("/disbursements/wallets", { method: "GET" });
  if (!res.ok) return 0;
  const items: unknown[] = Array.isArray(res.json?.data)
    ? res.json.data as unknown[]
    : Array.isArray(res.json)
      ? res.json as unknown[]
      : [];
  let total = 0;
  for (const raw of items) {
    const w = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
    if (String(w.currency || w.currencyCode || "").toUpperCase() !== currency) continue;
    total += asNumber(w.availableBalance ?? w.available_balance ?? w.balance);
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: biz } = await supabase
      .from("business_profiles")
      .select("id, kyb_status")
      .eq("owner_user_id", user.id)
      .eq("kyb_status", "approved")
      .maybeSingle();
    if (!biz) {
      return jsonResponse({
        error: "Partner bank-to-bank rails are available on an approved business account.",
      });
    }

    const body = await req.json().catch(() => ({})) as {
      amount?: number;
      currency?: string;
      currency_code?: string;
      rail?: string;
      wallet_id?: string;
      recipient_name?: string;
      recipient_account?: string;
      recipient_bank_code?: string;
      recipient_bank_name?: string;
      recipient_country?: string;
      dest_account_number?: string;
      dest_bank_code?: string;
      dest_bank_name?: string;
      dest_country?: string;
      note?: string;
      payout_method?: string;
    };

    const amount = Number(body.amount);
    const currency = String(body.currency || body.currency_code || "NGN").toUpperCase();
    const account = String(body.recipient_account || body.dest_account_number || "").replace(/\D/g, "");
    const bankCode = String(body.recipient_bank_code || body.dest_bank_code || "").trim();
    const country = String(body.recipient_country || body.dest_country || "NG").toUpperCase().slice(0, 2);
    const name = String(body.recipient_name || "Account holder").slice(0, 120);

    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: "Enter a payout amount." });
    }
    if (!account || !bankCode) {
      return jsonResponse({ error: "Destination bank is missing an account number or bank code." });
    }
    if (!["NG", "GH", "KE"].includes(country)) {
      return jsonResponse({
        error: "Partner bank-to-bank rails currently cover Nigeria, Ghana, and Kenya.",
      });
    }

    let walletId = String(body.wallet_id || "").trim();
    if (!walletId) {
      const { data: existing } = await supabase
        .from("wallets")
        .select("id")
        .eq("user_id", user.id)
        .eq("currency_code", currency)
        .maybeSingle();
      if (existing?.id) {
        walletId = existing.id;
      } else {
        const { data: created, error: wErr } = await supabase
          .from("wallets")
          .insert({ user_id: user.id, currency_code: currency, is_default: false })
          .select("id")
          .single();
        if (wErr || !created) throw wErr || new Error("Could not open wallet");
        walletId = created.id;
      }
    }

    const requested = String(body.rail || "auto").toLowerCase();
    const fincraBal = requested === "nomba" ? 0 : await fincraAvailable(currency).catch(() => 0);
    const nombaOk = nombaApiConfigured(getNombaApiConfig());

    let rail: Rail;
    if (requested === "fincra" || requested === "nomba") {
      rail = requested;
    } else if (fincraBal >= amount && getFincraConfig().secretKey) {
      rail = "fincra";
    } else if (nombaOk) {
      rail = "nomba";
    } else if (getFincraConfig().secretKey) {
      rail = "fincra";
    } else {
      return jsonResponse({
        error: "No bank-to-bank rail is configured. Set Fincra or Nomba secrets, or withdraw from the eFinMoney wallet.",
      });
    }

    if (rail === "fincra" && fincraBal + 1e-6 < amount && requested !== "fincra") {
      // Auto-picked Fincra without funds — fall through to Nomba when possible.
      if (nombaOk) rail = "nomba";
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .insert({
        sender_id: user.id,
        sender_wallet_id: walletId,
        recipient_name: name,
        recipient_account: account,
        recipient_bank_code: bankCode,
        recipient_bank_name: String(body.recipient_bank_name || body.dest_bank_name || "").slice(0, 120) || null,
        recipient_country: country,
        transfer_type: "bank",
        payout_method: String(body.payout_method || "bank").toLowerCase().slice(0, 32) || "bank",
        source_currency: currency,
        target_currency: currency,
        source_amount: amount,
        target_amount: amount,
        exchange_rate: 1,
        fee_amount: 0,
        // CHECK allows wallet|card|bank only; non-wallet skips the ledger-balance trigger.
        funding_source: "bank",
        provider_charge_id: `rail:${rail}`,
        rails_attempted: [rail],
        status: "initiated",
      })
      .select("id")
      .single();
    if (tErr || !transfer) throw tErr || new Error("Could not create transfer");

    const payoutBody = {
      transfer_id: transfer.id,
      account_number: account,
      bank_code: bankCode,
      amount,
      currency,
      recipient_name: name,
      skip_reversal: true,
    };

    const fn = rail === "fincra" ? "fincra-payout" : "nomba-payout";
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
        "x-internal-secret": serviceKey,
      },
      body: JSON.stringify(payoutBody),
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    const ok = res.ok && json.success !== false && json.stub !== true;

    if (!ok) {
      const message = String(json.error || json.message || `${fn} HTTP ${res.status}`);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: message.slice(0, 500),
      }).eq("id", transfer.id);
      return jsonResponse({
        error: message,
        rail,
        transfer_id: transfer.id,
      });
    }

    return jsonResponse({
      success: true,
      rail,
      transfer_id: transfer.id,
      reference: json.reference || json.payment_id || null,
      status: json.status || "processing",
      message: `Paid ${amount} ${currency} to ${name} via ${rail === "fincra" ? "Fincra" : "Nomba"} bank rails.`,
    });
  } catch (e) {
    console.error("linked-bank-rail-payout", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
