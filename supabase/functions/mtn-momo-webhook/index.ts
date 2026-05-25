// MTN MoMo callback / polling target.
// MTN posts the final state of a transfer here (or we can be called by a poller).
// On SUCCESSFUL state, we mark the transfer completed AND post a settlement
// journal: Debit user wallet liability, Credit MTN Settlement (1206).

import {
  MTN_BASE_URL,
  MTN_TARGET_ENV,
  getRemittanceToken,
  getServiceClient,
  mtnPrimaryKey,
} from "../_shared/mtn-momo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function postSettlementJournal(supabase: any, transferId: string) {
  const { data: transfer } = await supabase
    .from("transfers").select("*").eq("id", transferId).single();
  if (!transfer) return;

  // Idempotency: skip if a settlement journal already exists
  const { data: existing } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "mtn_settlement")
    .eq("reference_id", transferId)
    .limit(1);
  if (existing && existing.length > 0) return;

  const { data: mtnAcc } = await supabase
    .from("ledger_accounts").select("id").eq("code", "1206").maybeSingle();
  const { data: liabAcc } = await supabase
    .from("ledger_accounts").select("id")
    .like("code", "21%").eq("currency_code", transfer.source_currency).limit(1).maybeSingle();

  if (!mtnAcc || !liabAcc) {
    console.error("Missing ledger accounts for MTN settlement");
    return;
  }

  const journalId = crypto.randomUUID();
  const amount = Number(transfer.target_amount ?? transfer.source_amount);

  await supabase.from("ledger_entries").insert([
    {
      journal_id: journalId,
      account_id: liabAcc.id,
      wallet_id: transfer.sender_wallet_id,
      currency_code: transfer.source_currency,
      debit_amount: amount,
      credit_amount: 0,
      description: `MTN MoMo settlement debit for ${transfer.recipient_name}`,
      reference_type: "mtn_settlement",
      reference_id: transferId,
    },
    {
      journal_id: journalId,
      account_id: mtnAcc.id,
      wallet_id: null,
      currency_code: transfer.source_currency,
      debit_amount: 0,
      credit_amount: amount,
      description: "MTN Settlement clearing",
      reference_type: "mtn_settlement",
      reference_id: transferId,
    },
  ]);
}

async function pollMtnStatus(supabase: any, referenceId: string): Promise<string | null> {
  const token = await getRemittanceToken(supabase);
  const res = await fetch(`${MTN_BASE_URL}/remittance/v1_0/transfer/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Target-Environment": MTN_TARGET_ENV,
      "Ocp-Apim-Subscription-Key": mtnPrimaryKey(),
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.status || null; // PENDING | SUCCESSFUL | FAILED
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Callback authentication. MTN MoMo callback URL must be configured with a
  // shared secret (?secret=...) or x-callback-secret header. Internal pollers
  // can use the SUPABASE_SERVICE_ROLE_KEY via x-internal-secret.
  const expectedCb = Deno.env.get("MTN_CALLBACK_SECRET") || "";
  const expectedInt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const providedCb = req.headers.get("x-callback-secret") || new URL(req.url).searchParams.get("secret") || "";
  const providedInt = req.headers.get("x-internal-secret") || "";
  const cbOk = expectedCb && providedCb === expectedCb;
  const intOk = expectedInt && providedInt === expectedInt;
  if (!cbOk && !intOk) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = getServiceClient();
  try {
    let referenceId: string | null = null;
    let externalId: string | null = null;
    let status: string | null = null;

    // Support both push callbacks (MTN) and explicit poll requests from us.
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      referenceId = body.referenceId || body.financialTransactionId || null;
      externalId = body.externalId || null;
      status = body.status || null;
      if (!status && body.transfer_id) {
        // explicit poll
        const { data: t } = await supabase
          .from("transfers").select("provider_reference, id")
          .eq("id", body.transfer_id).single();
        if (t?.provider_reference) {
          referenceId = t.provider_reference;
          externalId = t.id;
          status = await pollMtnStatus(supabase, referenceId);
        }
      }
    } else {
      const url = new URL(req.url);
      referenceId = url.searchParams.get("referenceId");
      if (referenceId) status = await pollMtnStatus(supabase, referenceId);
    }

    if (!referenceId && !externalId) {
      return new Response(JSON.stringify({ success: false, error: "missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lookup = externalId
      ? await supabase.from("transfers").select("id").eq("id", externalId).maybeSingle()
      : await supabase.from("transfers").select("id").eq("provider_reference", referenceId).maybeSingle();
    const transferId = lookup.data?.id;
    if (!transferId) {
      return new Response(JSON.stringify({ success: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "SUCCESSFUL") {
      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", transferId);
      try { await postSettlementJournal(supabase, transferId); }
      catch (e) { console.error("Ledger post error:", e); }
    } else if (status === "FAILED") {
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: "MTN reported FAILED",
      }).eq("id", transferId);
    }

    return new Response(JSON.stringify({ success: true, status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("mtn-momo-webhook error:", err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
