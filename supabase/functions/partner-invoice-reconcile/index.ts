// Reconciles a partner's billed invoice lines against the cost the routing
// engine recorded for the same transactions (transaction_economics).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const LineSchema = z.object({
  partner_reference: z.string().max(200).optional().nullable(),
  transfer_id: z.string().uuid().optional().nullable(),
  transaction_date: z.string().max(40).optional().nullable(),
  currency_code: z.string().max(10).optional().nullable(),
  amount: z.number().optional().nullable(),
  billed_fee: z.number(),
});

const BodySchema = z.object({
  invoice_id: z.string().uuid().optional(),
  partner_id: z.string().uuid().optional(),
  invoice_number: z.string().min(1).max(120).optional(),
  period_start: z.string().max(40).optional(),
  period_end: z.string().max(40).optional(),
  currency_code: z.string().max(10).optional(),
  lines: z.array(LineSchema).max(5000).optional(),
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
    // Auth: pricing managers only.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isManager } = await supabase.rpc("is_pricing_manager", { _uid: user.id });
    if (!isManager) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = parsed.data;

    // 1. Resolve or create the invoice.
    let invoiceId = body.invoice_id ?? null;
    if (!invoiceId) {
      if (!body.partner_id || !body.invoice_number || !body.period_start || !body.period_end) {
        return new Response(
          JSON.stringify({ error: "partner_id, invoice_number, period_start and period_end are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: inv, error: invErr } = await supabase
        .from("partner_invoices")
        .insert({
          partner_id: body.partner_id,
          invoice_number: body.invoice_number,
          period_start: body.period_start,
          period_end: body.period_end,
          currency_code: (body.currency_code ?? "USD").toUpperCase(),
          uploaded_by: user.id,
        })
        .select("id")
        .single();
      if (invErr) throw invErr;
      invoiceId = inv.id;
    }

    // 2. Replace lines when a new set was supplied.
    if (body.lines?.length) {
      await supabase.from("partner_invoice_lines").delete().eq("invoice_id", invoiceId);
      const { error: lineErr } = await supabase.from("partner_invoice_lines").insert(
        body.lines.map((l) => ({
          invoice_id: invoiceId,
          partner_reference: l.partner_reference ?? null,
          transfer_id: l.transfer_id ?? null,
          transaction_date: l.transaction_date ?? null,
          currency_code: l.currency_code ? l.currency_code.toUpperCase() : null,
          amount: l.amount ?? null,
          billed_fee: l.billed_fee,
        })),
      );
      if (lineErr) throw lineErr;
    }

    // 3. Load invoice + lines, then match against recorded economics.
    const { data: invoice, error: getErr } = await supabase
      .from("partner_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    if (getErr) throw getErr;

    const { data: lines } = await supabase
      .from("partner_invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId);

    const transferIds = (lines ?? []).map((l: any) => l.transfer_id).filter(Boolean);
    const econByTransfer = new Map<string, any>();
    if (transferIds.length) {
      const { data: econ } = await supabase
        .from("transaction_economics")
        .select("*")
        .in("transfer_id", transferIds);
      for (const e of econ ?? []) econByTransfer.set(e.transfer_id, e);
    }

    let billedTotal = 0;
    let expectedTotal = 0;
    let matched = 0;
    let unmatched = 0;

    for (const line of lines ?? []) {
      const billed = Number(line.billed_fee) || 0;
      billedTotal += billed;

      const econ = line.transfer_id ? econByTransfer.get(line.transfer_id) : null;
      if (!econ) {
        unmatched += 1;
        await supabase
          .from("partner_invoice_lines")
          .update({ expected_fee: null, variance: null, match_status: "unmatched" })
          .eq("id", line.id);
        continue;
      }

      const expected = round2(
        (Number(econ.partner_fixed_fee ?? 0) || 0) +
          (Number(econ.partner_percentage_fee ?? 0) || 0) +
          (Number(econ.settlement_cost ?? 0) || 0) +
          (Number(econ.network_cost ?? 0) || 0) +
          (Number(econ.compliance_cost ?? 0) || 0),
      );
      const variance = round2(billed - expected);
      expectedTotal += expected;
      matched += 1;

      await supabase
        .from("partner_invoice_lines")
        .update({
          expected_fee: expected,
          variance,
          match_status: Math.abs(variance) <= 0.01 ? "matched" : "variance",
        })
        .eq("id", line.id);
    }

    // Transactions we paid for in the period that the partner never billed.
    const { count: periodCount } = await supabase
      .from("transaction_economics")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", invoice.partner_id)
      .gte("created_at", invoice.period_start)
      .lte("created_at", `${invoice.period_end}T23:59:59Z`);

    const missing = Math.max(0, (periodCount ?? 0) - matched);

    const { error: updErr } = await supabase
      .from("partner_invoices")
      .update({
        billed_total: round2(billedTotal),
        expected_total: round2(expectedTotal),
        variance_total: round2(billedTotal - expectedTotal),
        matched_lines: matched,
        unmatched_lines: unmatched,
        missing_lines: missing,
        status: "reconciled",
        reconciled_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({
        success: true,
        invoice_id: invoiceId,
        billed_total: round2(billedTotal),
        expected_total: round2(expectedTotal),
        variance_total: round2(billedTotal - expectedTotal),
        matched,
        unmatched,
        missing,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("partner-invoice-reconcile failed", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
