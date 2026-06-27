// Pay a purchase bill: posts ledger entries (DR AP, CR wallet/settlement), updates bill payment status.
// Optionally routes via maker-checker when amount >= threshold.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const APPROVAL_THRESHOLD = 1000; // base currency units

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const billId = String(body?.bill_id || "");
    const amount = Number(body?.amount || 0);
    const method = String(body?.payment_method || "wallet");
    const walletId = body?.wallet_id ? String(body.wallet_id) : null;
    const railRef = body?.rail_reference ? String(body.rail_reference) : null;
    const notes = body?.notes ? String(body.notes) : null;

    if (!billId || amount <= 0) return json({ error: "bill_id and positive amount required" }, 400);

    const { data: bill, error: bErr } = await admin
      .from("purchase_bills")
      .select("id, total_amount, amount_paid, currency_code, vendor_id, status, payment_status, bill_number")
      .eq("id", billId)
      .maybeSingle();
    if (bErr || !bill) return json({ error: "Bill not found" }, 404);
    if (bill.payment_status === "paid") return json({ error: "Bill already paid" }, 400);

    const outstanding = Number(bill.total_amount) - Number(bill.amount_paid || 0);
    if (amount > outstanding + 0.005) return json({ error: `Amount exceeds outstanding ${outstanding.toFixed(2)}` }, 400);

    // Approval gate
    if (amount >= APPROVAL_THRESHOLD) {
      const { data: existing } = await admin
        .from("maker_checker_requests")
        .select("id, status")
        .eq("action_type", "vendor_bill_pay")
        .eq("entity_id", billId)
        .in("status", ["pending", "approved"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existing || existing.status !== "approved") {
        if (!existing) {
          await admin.from("maker_checker_requests").insert({
            action_type: "vendor_bill_pay",
            entity_type: "purchase_bill",
            entity_id: billId,
            requested_by: user.id,
            status: "pending",
            payload: { bill_id: billId, amount, method, wallet_id: walletId, rail_reference: railRef, notes },
          });
        }
        // Record the payment as pending awaiting approval
        const { data: pendingPay } = await admin.from("vendor_bill_payments").insert({
          bill_id: billId, amount, currency_code: bill.currency_code, payment_method: method,
          wallet_id: walletId, rail_reference: railRef, status: "pending",
          created_by: user.id, notes,
        }).select().single();
        return json({ ok: true, requires_approval: true, payment_id: pendingPay?.id });
      }
    }

    // Resolve ledger accounts
    const { data: apAcct } = await admin.from("ledger_accounts").select("id").eq("code", "2400").maybeSingle();
    if (!apAcct) return json({ error: "Accounts Payable (2400) not configured" }, 500);

    let creditAcctId: string | null = null;
    if (method === "wallet") {
      if (!walletId) return json({ error: "wallet_id required for wallet payment" }, 400);
      const { data: w } = await admin.from("wallets").select("id, currency_code, user_id").eq("id", walletId).maybeSingle();
      if (!w) return json({ error: "Wallet not found" }, 404);
      const { data: la } = await admin.from("ledger_accounts").select("id")
        .like("code", "21%").eq("currency_code", w.currency_code).limit(1).maybeSingle();
      creditAcctId = la?.id || null;
    } else {
      // External rail — credit settlement-in-flight (PawaPay Settlement / generic)
      const { data: la } = await admin.from("ledger_accounts").select("id").eq("code", "1207").maybeSingle();
      creditAcctId = la?.id || null;
    }
    if (!creditAcctId) return json({ error: "Could not resolve credit account" }, 500);

    const journalId = crypto.randomUUID();
    const entries = [
      {
        journal_id: journalId, account_id: apAcct.id, currency_code: bill.currency_code,
        debit_amount: amount, credit_amount: 0,
        description: `Bill payment ${bill.bill_number}`, reference_type: "vendor_bill_payment",
        created_by: user.id,
      },
      {
        journal_id: journalId, account_id: creditAcctId, wallet_id: walletId,
        currency_code: bill.currency_code, debit_amount: 0, credit_amount: amount,
        description: `Bill payment ${bill.bill_number}`, reference_type: "vendor_bill_payment",
        created_by: user.id,
      },
    ];
    const { error: leErr } = await admin.from("ledger_entries").insert(entries);
    if (leErr) return json({ error: `Ledger error: ${leErr.message}` }, 500);

    const { data: pay, error: pErr } = await admin.from("vendor_bill_payments").insert({
      bill_id: billId, amount, currency_code: bill.currency_code, payment_method: method,
      wallet_id: walletId, rail_reference: railRef, status: "completed",
      journal_id: journalId, paid_at: new Date().toISOString(),
      created_by: user.id, notes,
    }).select().single();
    if (pErr) return json({ error: pErr.message }, 500);

    const newPaid = Number(bill.amount_paid || 0) + amount;
    const fullyPaid = newPaid >= Number(bill.total_amount) - 0.005;
    await admin.from("purchase_bills").update({
      amount_paid: newPaid,
      payment_status: fullyPaid ? "paid" : "partial",
      status: fullyPaid ? "paid" : "partial",
    }).eq("id", billId);

    return json({ ok: true, payment_id: pay.id, journal_id: journalId, fully_paid: fullyPaid });
  } catch (e) {
    console.error("vendor-bill-pay error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
