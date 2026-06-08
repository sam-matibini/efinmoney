// Polls Elicate for the current status of every transfer still in `processing`
// state, then completes/fails them using the same ledger logic as the webhook.
// Safe to run on a schedule (cron) or invoke ad-hoc to test transfer completion.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getElicateConfig } from "../_shared/elicate.ts";

function statusUrl(baseUrl: string, txId: string): string {
  // baseUrl is the charge endpoint .../api/v1/payments/charge → strip /charge
  const u = new URL(baseUrl);
  u.pathname = u.pathname.replace(/\/charge\/?$/i, "");
  return `${u.origin}${u.pathname}/${encodeURIComponent(txId)}`;
}

async function settleSuccess(
  supabase: ReturnType<typeof createClient>,
  transfer: any,
  providerRef: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (transfer.status === "completed") return { ok: true };

  const { data: elicateAcc } = await supabase
    .from("ledger_accounts").select("id").eq("code", "1205").maybeSingle();
  const { data: walletLiab } = await supabase
    .from("ledger_accounts").select("id")
    .like("code", "21%").eq("currency_code", "ZMW").limit(1).single();

  if (!elicateAcc || !walletLiab) return { ok: false, reason: "Ledger setup incomplete" };

  const journalId = crypto.randomUUID();
  const amount = Number(transfer.target_amount);

  const entries: any[] = [
    {
      journal_id: journalId,
      account_id: walletLiab.id,
      wallet_id: null,
      currency_code: "ZMW",
      debit_amount: amount,
      credit_amount: 0,
      description: `Elicate payout settled to ${transfer.recipient_name}`,
      reference_type: "elicate_payout",
      reference_id: transfer.id,
    },
    {
      journal_id: journalId,
      account_id: elicateAcc.id,
      wallet_id: null,
      currency_code: "ZMW",
      debit_amount: 0,
      credit_amount: amount,
      description: `Elicate settlement clearing for ${providerRef}`,
      reference_type: "elicate_payout",
      reference_id: transfer.id,
    },
  ];

  const { data: payableAcc } = await supabase
    .from("ledger_accounts").select("id").eq("code", "2123").maybeSingle();
  if (payableAcc) {
    entries[0].account_id = payableAcc.id;
    entries[0].description = `Clear ZMW payable for ${transfer.recipient_name}`;
  }

  // Idempotency guard — never double-post the same settlement
  const { data: existing } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "elicate_payout")
    .eq("reference_id", transfer.id)
    .limit(1);
  if (!existing || existing.length === 0) {
    const { error: leErr } = await supabase.from("ledger_entries").insert(entries);
    if (leErr) return { ok: false, reason: leErr.message };
  }

  await supabase.from("transfers").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", transfer.id);

  return { ok: true };
}

async function reverseLedger(supabase: ReturnType<typeof createClient>, transferId: string) {
  const { data: already } = await supabase
    .from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (already && already.length) return;

  const { data: originals } = await supabase
    .from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description, created_by")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (!originals?.length) return;

  const journalId = crypto.randomUUID();
  const rows = originals.map((e) => ({
    journal_id: journalId,
    account_id: e.account_id,
    wallet_id: e.wallet_id,
    currency_code: e.currency_code,
    debit_amount: Number(e.credit_amount) || 0,
    credit_amount: Number(e.debit_amount) || 0,
    description: `REVERSAL: ${e.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal",
    reference_id: transferId,
    created_by: e.created_by,
  }));
  await supabase.from("ledger_entries").insert(rows);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let transferId: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      transferId = body?.transfer_id ?? null;
    }

    const { mode, url, secretKey } = getElicateConfig();
    if (!secretKey || !url) {
      return new Response(JSON.stringify({ error: "Elicate not configured", mode }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = supabase
      .from("transfers")
      .select("*")
      .eq("status", "processing")
      .eq("target_currency", "ZMW")
      .not("provider_reference", "is", null)
      .like("provider_reference", "EP-%")
      .order("created_at", { ascending: false })
      .limit(50);

    if (transferId) q = q.eq("id", transferId);

    const { data: transfers, error } = await q;
    if (error) throw error;

    const results: any[] = [];
    for (const t of transfers ?? []) {
      const providerRef: string = t.provider_reference;
      const u = statusUrl(url, providerRef);
      const r = await fetch(u, {
        headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
      });
      const text = await r.text();
      let body: any = {};
      try { body = JSON.parse(text); } catch { body = { raw: text }; }

      const status = String(body?.status ?? body?.data?.status ?? "").toLowerCase();
      let action = "no_change";

      if (["successful", "success", "completed", "paid"].includes(status)) {
        const res = await settleSuccess(supabase, t, providerRef);
        action = res.ok ? "completed" : `error:${res.reason}`;
      } else if (["failed", "failure", "rejected", "cancelled", "canceled"].includes(status)) {
        await reverseLedger(supabase, t.id);
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: body?.message || body?.reason || `Elicate status: ${status}`,
        }).eq("id", t.id);
        action = "failed";
      }

      results.push({
        transfer_id: t.id,
        provider_reference: providerRef,
        provider_status: status || "(unknown)",
        action,
        http: r.status,
      });
    }

    return new Response(JSON.stringify({ mode, checked: results.length, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
