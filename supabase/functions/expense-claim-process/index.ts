// Expense claim lifecycle: submit, approve, reject, reimburse.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const claimId = String(body?.claim_id || "");
    if (!action || !claimId) return json({ error: "action and claim_id required" }, 400);

    const { data: claim } = await admin.from("expense_claims").select("*").eq("id", claimId).maybeSingle();
    if (!claim) return json({ error: "Claim not found" }, 404);

    // Permission check for non-owner actions
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    const isFinance = roles.includes("admin") || roles.includes("finance");

    if (action === "submit") {
      if (claim.submitter_user_id !== user.id) return json({ error: "Only submitter can submit" }, 403);
      const { data: items } = await admin.from("expense_claim_items").select("amount, tax_amount").eq("claim_id", claimId);
      const subtotal = (items || []).reduce((s, i) => s + Number(i.amount), 0);
      const tax = (items || []).reduce((s, i) => s + Number(i.tax_amount || 0), 0);
      await admin.from("expense_claims").update({
        status: "submitted", subtotal, tax_amount: tax, total: subtotal + tax,
        submitted_at: new Date().toISOString(),
      }).eq("id", claimId);
      return json({ ok: true });
    }

    if (action === "approve") {
      if (!isFinance) return json({ error: "Forbidden" }, 403);
      // Post DR Expense, CR AP(employee)
      const { data: items } = await admin.from("expense_claim_items").select("*").eq("claim_id", claimId);
      const { data: apAcct } = await admin.from("ledger_accounts").select("id").eq("code", "2400").maybeSingle();
      if (!apAcct) return json({ error: "AP account 2400 missing" }, 500);
      const journalId = crypto.randomUUID();
      const entries: any[] = [];
      let total = 0;
      for (const it of items || []) {
        const amt = Number(it.amount) + Number(it.tax_amount || 0);
        total += amt;
        if (it.gl_account_id) {
          entries.push({
            journal_id: journalId, account_id: it.gl_account_id,
            currency_code: it.currency_code, debit_amount: amt, credit_amount: 0,
            description: `Expense ${claim.claim_number} - ${it.merchant || ""}`,
            reference_type: "expense_claim", created_by: user.id,
          });
        }
      }
      entries.push({
        journal_id: journalId, account_id: apAcct.id,
        currency_code: claim.currency_code, debit_amount: 0, credit_amount: total,
        description: `Expense claim ${claim.claim_number}`,
        reference_type: "expense_claim", created_by: user.id,
      });
      const { error: leErr } = await admin.from("ledger_entries").insert(entries);
      if (leErr) return json({ error: `Ledger: ${leErr.message}` }, 500);
      await admin.from("expense_claims").update({
        status: "approved", approved_at: new Date().toISOString(), approved_by: user.id,
      }).eq("id", claimId);
      return json({ ok: true, journal_id: journalId });
    }

    if (action === "reject") {
      if (!isFinance) return json({ error: "Forbidden" }, 403);
      await admin.from("expense_claims").update({
        status: "rejected", rejected_reason: body?.reason || "Rejected",
      }).eq("id", claimId);
      return json({ ok: true });
    }

    if (action === "reimburse") {
      if (!isFinance) return json({ error: "Forbidden" }, 403);
      if (claim.status !== "approved") return json({ error: "Claim must be approved first" }, 400);
      const walletId = body?.wallet_id ? String(body.wallet_id) : null;
      const method = String(body?.method || "wallet");
      const { data: apAcct } = await admin.from("ledger_accounts").select("id").eq("code", "2400").maybeSingle();
      let creditAcctId: string | null = null;
      if (method === "wallet" && walletId) {
        const { data: w } = await admin.from("wallets").select("currency_code").eq("id", walletId).maybeSingle();
        const { data: la } = await admin.from("ledger_accounts").select("id")
          .like("code", "21%").eq("currency_code", w?.currency_code || claim.currency_code).limit(1).maybeSingle();
        creditAcctId = la?.id || null;
      } else {
        const { data: la } = await admin.from("ledger_accounts").select("id").eq("code", "1207").maybeSingle();
        creditAcctId = la?.id || null;
      }
      if (!apAcct || !creditAcctId) return json({ error: "Ledger accounts missing" }, 500);
      const journalId = crypto.randomUUID();
      const amt = Number(claim.total);
      const { error: leErr } = await admin.from("ledger_entries").insert([
        { journal_id: journalId, account_id: apAcct.id, currency_code: claim.currency_code,
          debit_amount: amt, credit_amount: 0, description: `Reimburse ${claim.claim_number}`,
          reference_type: "expense_claim_reimbursement", created_by: user.id },
        { journal_id: journalId, account_id: creditAcctId, wallet_id: walletId,
          currency_code: claim.currency_code, debit_amount: 0, credit_amount: amt,
          description: `Reimburse ${claim.claim_number}`,
          reference_type: "expense_claim_reimbursement", created_by: user.id },
      ]);
      if (leErr) return json({ error: `Ledger: ${leErr.message}` }, 500);
      await admin.from("expense_claims").update({
        status: "reimbursed", reimbursement_method: method, reimbursement_journal_id: journalId,
        reimbursed_at: new Date().toISOString(),
      }).eq("id", claimId);
      return json({ ok: true, journal_id: journalId });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("expense-claim-process error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
