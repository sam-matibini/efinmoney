// Approves (or disputes / voids) a reconciled partner invoice and posts the
// resulting network-fee expense to the ledger:
//   DR Network Fees - <ccy>      (approved billed total)
//   CR Partner Payables - <ccy>  (approved billed total)
// Disputed lines are excluded from the posted amount and tracked separately.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  invoice_id: z.string().uuid(),
  action: z.enum(["approve", "dispute", "void"]),
  disputed_line_ids: z.array(z.string().uuid()).max(5000).optional(),
  dispute_reason: z.string().max(500).optional(),
  vendor_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const round2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: isManager } = await supabase.rpc("is_pricing_manager", { _uid: user.id });
    if (!isManager) return json({ error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { invoice_id, action, disputed_line_ids = [], dispute_reason, vendor_id, notes } = parsed.data;

    const { data: invoice, error: invErr } = await supabase
      .from("partner_invoices")
      .select("*")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr) return json({ error: invErr.message }, 500);
    if (!invoice) return json({ error: "Invoice not found" }, 404);

    if (action === "void") {
      if (invoice.journal_id) return json({ error: "Posted invoices cannot be voided" }, 409);
      const { error } = await supabase
        .from("partner_invoices")
        .update({ status: "void", notes: notes ?? invoice.notes })
        .eq("id", invoice_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, status: "void" });
    }

    if (invoice.status === "approved" || invoice.status === "paid") {
      return json({ error: `Invoice already ${invoice.status}` }, 409);
    }

    // Apply line-level dispute flags.
    if (disputed_line_ids.length > 0) {
      const { error } = await supabase
        .from("partner_invoice_lines")
        .update({ dispute_status: "disputed", dispute_reason: dispute_reason ?? null })
        .in("id", disputed_line_ids)
        .eq("invoice_id", invoice_id);
      if (error) return json({ error: error.message }, 500);
    }
    if (action === "approve") {
      // Anything not flagged in this call is cleared.
      const clear = supabase
        .from("partner_invoice_lines")
        .update({ dispute_status: "none", dispute_reason: null })
        .eq("invoice_id", invoice_id)
        .eq("dispute_status", "disputed");
      const { error } = disputed_line_ids.length
        ? await clear.not("id", "in", `(${disputed_line_ids.join(",")})`)
        : await clear;
      if (error) return json({ error: error.message }, 500);
    }

    const { data: lines, error: lineErr } = await supabase
      .from("partner_invoice_lines")
      .select("billed_fee, dispute_status")
      .eq("invoice_id", invoice_id);
    if (lineErr) return json({ error: lineErr.message }, 500);

    const approvedTotal = round2(
      (lines ?? [])
        .filter((l) => l.dispute_status !== "disputed")
        .reduce((s, l) => s + Number(l.billed_fee ?? 0), 0),
    );
    const disputedTotal = round2(
      (lines ?? [])
        .filter((l) => l.dispute_status === "disputed")
        .reduce((s, l) => s + Number(l.billed_fee ?? 0), 0),
    );

    if (action === "dispute") {
      const { error } = await supabase
        .from("partner_invoices")
        .update({
          status: "disputed",
          approved_total: approvedTotal,
          disputed_total: disputedTotal,
          notes: notes ?? invoice.notes,
        })
        .eq("id", invoice_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, status: "disputed", approved_total: approvedTotal, disputed_total: disputedTotal });
    }

    // approve → post the expense journal.
    const currency = invoice.currency_code;
    let journalId: string | null = invoice.journal_id ?? null;

    if (approvedTotal > 0 && !journalId) {
      const { data: expenseAccId, error: expErr } = await supabase.rpc("ensure_network_fee_account", {
        p_ccy: currency,
      });
      if (expErr) return json({ error: `Expense account: ${expErr.message}` }, 500);
      const { data: payableAccId, error: payErr } = await supabase.rpc("ensure_partner_payable_account", {
        p_ccy: currency,
      });
      if (payErr) return json({ error: `Payable account: ${payErr.message}` }, 500);

      journalId = crypto.randomUUID();
      const description = `Partner invoice ${invoice.invoice_number}`;
      const { error: ledErr } = await supabase.from("ledger_entries").insert([
        {
          journal_id: journalId,
          account_id: expenseAccId,
          currency_code: currency,
          debit_amount: approvedTotal,
          credit_amount: 0,
          description,
          reference_type: "partner_invoice",
          reference_id: invoice_id,
          created_by: user.id,
        },
        {
          journal_id: journalId,
          account_id: payableAccId,
          currency_code: currency,
          debit_amount: 0,
          credit_amount: approvedTotal,
          description,
          reference_type: "partner_invoice",
          reference_id: invoice_id,
          created_by: user.id,
        },
      ]);
      if (ledErr) return json({ error: `Ledger error: ${ledErr.message}` }, 500);
    }

    const { error: updErr } = await supabase
      .from("partner_invoices")
      .update({
        status: "approved",
        approved_total: approvedTotal,
        disputed_total: disputedTotal,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        journal_id: journalId,
        vendor_id: vendor_id ?? invoice.vendor_id ?? null,
        notes: notes ?? invoice.notes,
      })
      .eq("id", invoice_id);
    if (updErr) return json({ error: updErr.message }, 500);

    return json({
      success: true,
      status: "approved",
      approved_total: approvedTotal,
      disputed_total: disputedTotal,
      journal_id: journalId,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
