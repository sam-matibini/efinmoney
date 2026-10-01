import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  CRA_KYC_THRESHOLD,
  CRA_MAX_AMOUNT,
  CRA_MIN_AMOUNT,
  craPaymentType,
  isValidBn9,
  isValidSin,
  normalizeDigits,
  normalizeProgramAccount,
  validatePeriod,
} from "../_shared/craPayment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

/** Ledger: wallet liability (2101 CAD) → Pending Transfers (2200) → Bank Trust CAD (1101). */
async function ledgerAccounts(admin: SupabaseClient) {
  const { data } = await admin.from("ledger_accounts").select("id, code").in("code", ["2101", "2200", "1101"]);
  const byCode = Object.fromEntries((data ?? []).map((a) => [a.code, a.id as string]));
  if (!byCode["2101"] || !byCode["2200"] || !byCode["1101"]) {
    throw new Error("Ledger accounts 2101/2200/1101 are missing");
  }
  return { walletLiab: byCode["2101"], pending: byCode["2200"], bankTrust: byCode["1101"] };
}

type Leg = { account_id: string; wallet_id: string | null; debit: number; credit: number };

async function postJournal(
  admin: SupabaseClient,
  legs: Leg[],
  description: string,
  referenceType: string,
  referenceId: string,
) {
  const journal = crypto.randomUUID();
  const { error } = await admin.from("ledger_entries").insert(legs.map((l) => ({
    journal_id: journal,
    account_id: l.account_id,
    wallet_id: l.wallet_id,
    currency_code: "CAD",
    debit_amount: l.debit,
    credit_amount: l.credit,
    description,
    reference_type: referenceType,
    reference_id: referenceId,
  })));
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "create");

    if (action === "create") {
      const type = craPaymentType(String(body.payment_type || ""));
      if (!type) return jsonResponse({ error: "Choose what you are paying" }, 400);

      const taxpayerName = String(body.taxpayer_name || "").trim().slice(0, 120);
      if (taxpayerName.length < 2) return jsonResponse({ error: "Enter the taxpayer's name as registered with CRA" }, 400);

      let sin: string | null = null;
      let businessNumber: string | null = null;
      let programAccount: string | null = null;
      if (type.taxpayer === "individual") {
        if (!isValidSin(body.sin)) return jsonResponse({ error: "That SIN is not valid. Check all 9 digits." }, 400);
        sin = normalizeDigits(body.sin);
      } else {
        if (!isValidBn9(body.business_number)) return jsonResponse({ error: "Business number must be 9 digits" }, 400);
        businessNumber = normalizeDigits(body.business_number);
        programAccount = normalizeProgramAccount(body.program_account);
        if (!new RegExp(`^${type.program}\\d{4}$`).test(programAccount)) {
          return jsonResponse({ error: `Program account must look like ${type.program}0001 for this payment type` }, 400);
        }
      }

      const period = validatePeriod(type.period, body.period);
      if (!period) return jsonResponse({ error: "Enter a valid tax year or period" }, 400);

      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount < CRA_MIN_AMOUNT) return jsonResponse({ error: `Minimum is C$${CRA_MIN_AMOUNT}` }, 400);
      if (amount > CRA_MAX_AMOUNT) return jsonResponse({ error: `Maximum is C$${CRA_MAX_AMOUNT.toLocaleString()} per payment` }, 400);

      const walletId = String(body.wallet_id || "");
      const { data: wallet } = await admin.from("wallets")
        .select("id, currency_code, status").eq("id", walletId).eq("user_id", user.id).maybeSingle();
      if (!wallet || wallet.currency_code !== "CAD") return jsonResponse({ error: "Select a CAD wallet" }, 400);
      if (wallet.status !== "active") return jsonResponse({ error: "This wallet is not active" }, 400);

      if (amount >= CRA_KYC_THRESHOLD) {
        const { data: profile } = await admin.from("profiles").select("kyc_status").eq("user_id", user.id).maybeSingle();
        if (!["approved", "verified"].includes(String(profile?.kyc_status || ""))) {
          return jsonResponse({ error: "Verify your identity to make CRA payments of C$1,000 or more" }, 403);
        }
      }

      const { data: rl } = await supabaseUser.rpc("check_rate_limit", {
        p_key: `cra_pay:${user.id}`, p_max_requests: 5, p_window_seconds: 60,
      });
      if (rl === false) return jsonResponse({ error: "Too many requests — try again shortly" }, 429);

      const { data: bal } = await admin.rpc("get_wallet_balance", { p_wallet_id: walletId });
      if (Number(bal || 0) < amount) return jsonResponse({ error: "Insufficient CAD wallet balance" }, 400);

      const accounts = await ledgerAccounts(admin);
      const reference = `efm_cra_${user.id.slice(0, 8)}_${Date.now()}`;
      const { data: row, error: insErr } = await admin.from("cra_payments").insert({
        user_id: user.id,
        wallet_id: walletId,
        reference,
        taxpayer_type: type.taxpayer,
        taxpayer_name: taxpayerName,
        sin,
        business_number: businessNumber,
        program_account: programAccount,
        payment_type: type.id,
        period,
        amount,
      }).select("id, reference, status, created_at").single();
      if (insErr) throw insErr;

      try {
        await postJournal(admin, [
          { account_id: accounts.walletLiab, wallet_id: walletId, debit: amount, credit: 0 },
          { account_id: accounts.pending, wallet_id: null, debit: 0, credit: amount },
        ], `CRA payment — ${type.label}`, "cra_payment", row.id);
      } catch (e) {
        await admin.from("cra_payments").delete().eq("id", row.id);
        throw e;
      }

      return jsonResponse({ success: true, payment: row });
    }

    if (action === "cancel") {
      const id = String(body.id || "");
      const { data: p } = await admin.from("cra_payments").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!p) return jsonResponse({ error: "Payment not found" }, 404);
      if (p.status !== "queued") return jsonResponse({ error: "This payment has already been sent to CRA and can't be cancelled" }, 409);

      const { data: claimed } = await admin.from("cra_payments")
        .update({ status: "cancelled", refunded_at: new Date().toISOString(), failure_reason: "Cancelled by customer" })
        .eq("id", id).eq("status", "queued").select("id").maybeSingle();
      if (!claimed) return jsonResponse({ error: "This payment is already being processed" }, 409);

      const accounts = await ledgerAccounts(admin);
      await postJournal(admin, [
        { account_id: accounts.pending, wallet_id: null, debit: Number(p.amount), credit: 0 },
        { account_id: accounts.walletLiab, wallet_id: p.wallet_id, debit: 0, credit: Number(p.amount) },
      ], "CRA payment cancelled — refund", "cra_payment_refund", p.id);
      return jsonResponse({ success: true });
    }

    // ── Ops actions ─────────────────────────────────────────────
    const { data: isAdmin } = await admin.rpc("is_admin_user", { _uid: user.id });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const id = String(body.id || "");
    const { data: p } = await admin.from("cra_payments").select("*").eq("id", id).maybeSingle();
    if (!p) return jsonResponse({ error: "Payment not found" }, 404);
    const amount = Number(p.amount);
    const notes = body.notes ? String(body.notes).slice(0, 500) : null;

    if (action === "remit") {
      const confirmation = String(body.bank_confirmation || "").trim().slice(0, 80);
      if (confirmation.length < 3) return jsonResponse({ error: "Enter the bank confirmation number" }, 400);
      const { data: claimed } = await admin.from("cra_payments").update({
        status: "remitted",
        bank_confirmation: confirmation,
        remitted_at: new Date().toISOString(),
        remitted_by: user.id,
        ops_notes: notes ?? p.ops_notes,
      }).eq("id", id).eq("status", "queued").select("id").maybeSingle();
      if (!claimed) return jsonResponse({ error: `Payment is ${p.status}, not queued` }, 409);

      const accounts = await ledgerAccounts(admin);
      await postJournal(admin, [
        { account_id: accounts.pending, wallet_id: null, debit: amount, credit: 0 },
        { account_id: accounts.bankTrust, wallet_id: null, debit: 0, credit: amount },
      ], `CRA remittance ${confirmation}`, "cra_payment_remit", p.id);
      return jsonResponse({ success: true });
    }

    if (action === "confirm") {
      const { data: claimed } = await admin.from("cra_payments").update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        ops_notes: notes ?? p.ops_notes,
      }).eq("id", id).eq("status", "remitted").select("id").maybeSingle();
      if (!claimed) return jsonResponse({ error: `Payment is ${p.status}, not remitted` }, 409);
      return jsonResponse({ success: true });
    }

    if (action === "refund") {
      const reason = String(body.reason || "").trim().slice(0, 300);
      if (reason.length < 3) return jsonResponse({ error: "Enter a reason for the refund" }, 400);
      if (!["queued", "remitted"].includes(p.status)) return jsonResponse({ error: `Payment is ${p.status}` }, 409);

      const { data: claimed } = await admin.from("cra_payments").update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        failure_reason: reason,
        ops_notes: notes ?? p.ops_notes,
      }).eq("id", id).eq("status", p.status).select("id").maybeSingle();
      if (!claimed) return jsonResponse({ error: "Payment changed — refresh and try again" }, 409);

      const accounts = await ledgerAccounts(admin);
      // Queued: money is still in Pending Transfers. Remitted: CRA returned it to our bank.
      const source = p.status === "queued" ? accounts.pending : accounts.bankTrust;
      await postJournal(admin, [
        { account_id: source, wallet_id: null, debit: amount, credit: 0 },
        { account_id: accounts.walletLiab, wallet_id: p.wallet_id, debit: 0, credit: amount },
      ], `CRA payment refund — ${reason}`, "cra_payment_refund", p.id);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("cra-payment error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "CRA payment failed" }, 500);
  }
});
