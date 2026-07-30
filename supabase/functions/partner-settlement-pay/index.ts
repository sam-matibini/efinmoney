// Records payment of one or more approved partner invoices and posts:
//   DR Partner Payables - <ccy>
//   CR <funding asset account> (bank trust / settlement account)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  partner_id: z.string().uuid(),
  currency_code: z.string().min(2).max(10),
  invoice_ids: z.array(z.string().uuid()).min(1).max(500),
  funding_account_id: z.string().uuid(),
  payment_method: z.string().max(60).optional(),
  payment_reference: z.string().max(200).optional(),
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
    const body = parsed.data;
    const currency = body.currency_code.toUpperCase();

    const { data: invoices, error: invErr } = await supabase
      .from("partner_invoices")
      .select("id, partner_id, currency_code, status, approved_total, period_start, period_end, invoice_number")
      .in("id", body.invoice_ids);
    if (invErr) return json({ error: invErr.message }, 500);
    if (!invoices?.length) return json({ error: "No invoices found" }, 404);

    const invalid = invoices.filter(
      (i) => i.status !== "approved" || i.partner_id !== body.partner_id || i.currency_code !== currency,
    );
    if (invalid.length) {
      return json(
        { error: `Invoices must be approved and match the partner/currency: ${invalid.map((i) => i.invoice_number).join(", ")}` },
        409,
      );
    }

    const totalDue = round2(invoices.reduce((s, i) => s + Number(i.approved_total ?? 0), 0));
    if (totalDue <= 0) return json({ error: "Nothing to settle" }, 400);

    // Funding account must exist and match the settlement currency.
    const { data: fundingAcc, error: fundErr } = await supabase
      .from("ledger_accounts")
      .select("id, currency_code, name")
      .eq("id", body.funding_account_id)
      .maybeSingle();
    if (fundErr) return json({ error: fundErr.message }, 500);
    if (!fundingAcc) return json({ error: "Funding account not found" }, 404);
    if (fundingAcc.currency_code && fundingAcc.currency_code !== currency) {
      return json({ error: `Funding account is ${fundingAcc.currency_code}, settlement is ${currency}` }, 400);
    }

    const { data: payableAccId, error: payErr } = await supabase.rpc("ensure_partner_payable_account", {
      p_ccy: currency,
    });
    if (payErr) return json({ error: `Payable account: ${payErr.message}` }, 500);

    const periodStart = invoices.map((i) => i.period_start).filter(Boolean).sort()[0] ?? null;
    const periodEnd = invoices.map((i) => i.period_end).filter(Boolean).sort().at(-1) ?? null;

    const journalId = crypto.randomUUID();

    const { data: settlement, error: setErr } = await supabase
      .from("partner_settlements")
      .insert({
        partner_id: body.partner_id,
        currency_code: currency,
        period_start: periodStart,
        period_end: periodEnd,
        total_due: totalDue,
        amount_paid: totalDue,
        invoice_count: invoices.length,
        payment_method: body.payment_method ?? "manual",
        payment_reference: body.payment_reference ?? null,
        status: "paid",
        journal_id: journalId,
        notes: body.notes ?? null,
        created_by: user.id,
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (setErr) return json({ error: setErr.message }, 500);

    const description = `Partner settlement ${invoices.length} invoice(s) ${currency}`;
    const { error: ledErr } = await supabase.from("ledger_entries").insert([
      {
        journal_id: journalId,
        account_id: payableAccId,
        currency_code: currency,
        debit_amount: totalDue,
        credit_amount: 0,
        description,
        reference_type: "partner_settlement",
        reference_id: settlement.id,
        created_by: user.id,
      },
      {
        journal_id: journalId,
        account_id: body.funding_account_id,
        currency_code: currency,
        debit_amount: 0,
        credit_amount: totalDue,
        description,
        reference_type: "partner_settlement",
        reference_id: settlement.id,
        created_by: user.id,
      },
    ]);
    if (ledErr) {
      await supabase.from("partner_settlements").delete().eq("id", settlement.id);
      return json({ error: `Ledger error: ${ledErr.message}` }, 500);
    }

    const { error: updErr } = await supabase
      .from("partner_invoices")
      .update({ status: "paid", settlement_id: settlement.id, paid_at: new Date().toISOString() })
      .in("id", body.invoice_ids);
    if (updErr) return json({ error: updErr.message }, 500);

    return json({
      success: true,
      settlement_id: settlement.id,
      journal_id: journalId,
      total_paid: totalDue,
      invoices: invoices.length,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
