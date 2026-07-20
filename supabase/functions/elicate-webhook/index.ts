import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getElicateConfig, isElicateFailureStatus, isElicateSuccessStatus } from "../_shared/elicate.ts";
import { settleElicateChargeCredit } from "../_shared/elicate-settle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-elicatepay-signature, x-elicate-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET, HEAD",
};

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

async function reverseTransferLedger(
  supabase: ReturnType<typeof createClient>,
  transferId: string,
) {
  const { data: existing } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "transfer_reversal")
    .eq("reference_id", transferId)
    .limit(1);
  if (existing?.length) return { reversed: false, reason: "already_reversed" };

  const { data: originals, error } = await supabase
    .from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description, created_by")
    .eq("reference_type", "transfer")
    .eq("reference_id", transferId);
  if (error || !originals?.length) return { reversed: false, reason: error?.message || "no_entries" };

  const journalId = crypto.randomUUID();
  const rows = originals.map((entry) => ({
    journal_id: journalId,
    account_id: entry.account_id,
    wallet_id: entry.wallet_id,
    currency_code: entry.currency_code,
    debit_amount: Number(entry.credit_amount) || 0,
    credit_amount: Number(entry.debit_amount) || 0,
    description: `REVERSAL: ${entry.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal",
    reference_id: transferId,
    created_by: entry.created_by,
  }));
  const { error: insErr } = await supabase.from("ledger_entries").insert(rows);
  if (insErr) return { reversed: false, reason: insErr.message };
  return { reversed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(
      JSON.stringify({ ok: true, endpoint: "elicate-webhook", message: "Webhook is live. POST signed events here." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-elicatepay-signature")?.trim()
      || req.headers.get("x-elicate-signature")?.trim()
      || "";

    let sigClean = signature.replace(/^sha256=/i, "").trim();
    const v1Match = sigClean.match(/v1=([a-f0-9]+)/i);
    if (v1Match) sigClean = v1Match[1];

    const { mode, webhookSecret } = getElicateConfig();
    if (!webhookSecret) {
      console.error(`ELICATE_${mode === "live" ? "LIVE_" : ""}WEBHOOK_SECRET not configured`);
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedHmac = await hmacHex(webhookSecret, rawBody);
    const sigValid = !!sigClean && timingSafeEqualHex(sigClean, expectedHmac);

    if (!sigValid) {
      console.warn("Invalid Elicate webhook signature", {
        mode,
        receivedPreview: signature ? `${signature.slice(0, 8)}…` : "(empty)",
      });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const eventType: string = payload.event || payload.type || "";
    const data = payload.data || payload;
    const providerRef: string | undefined =
      data.transaction_id || data.payout_id || data.transactionId || data.id;
    const merchantReference: string | undefined = data.reference;

    if (!providerRef && !merchantReference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statusRaw = String(data.status ?? "");
    const isSuccess =
      ["payout.successful", "payout.success", "charge.successful", "charge.success", "payment.successful", "payment.success", "payment.test"]
        .includes(eventType)
      || isElicateSuccessStatus(statusRaw);
    const isFailure =
      ["payout.failed", "payout.failure", "charge.failed", "payment.failed"].includes(eventType)
      || isElicateFailureStatus(statusRaw);

    const findCharge = async () => {
      if (providerRef) {
        const r = await supabase.from("elicate_charges").select("*").eq("psp_reference", providerRef).maybeSingle();
        if (r.data) return r.data;
      }
      if (merchantReference) {
        const r = await supabase.from("elicate_charges").select("*").eq("reference", merchantReference).maybeSingle();
        if (r.data) return r.data;
      }
      return null;
    };
    const charge = await findCharge();

    if (charge) {
      if (charge.status === "completed") {
        return new Response(JSON.stringify({ received: true, duplicate: true, kind: "charge" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isFailure) {
        await supabase.from("elicate_charges").update({
          status: "failed",
          failure_reason: data.reason || data.message || "Top-up failed",
          last_event: data,
        }).eq("id", charge.id);
        return new Response(JSON.stringify({ received: true, kind: "charge", outcome: "failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isSuccess) {
        const settled = await settleElicateChargeCredit(
          supabase,
          charge,
          providerRef ?? null,
          data,
        );
        if (!settled.ok) {
          return new Response(JSON.stringify({ error: settled.reason }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ received: true, kind: "charge", outcome: "completed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("elicate_charges").update({ last_event: data }).eq("id", charge.id);
      return new Response(JSON.stringify({ received: true, kind: "charge", outcome: "noop" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let transfer: Record<string, unknown> | null = null;
    if (providerRef) {
      const { data: t } = await supabase.from("transfers").select("*").eq("provider_reference", providerRef).maybeSingle();
      transfer = t;
    }
    if (!transfer && merchantReference) {
      const byId = await supabase.from("transfers").select("*").eq("id", merchantReference).maybeSingle();
      transfer = byId.data;
    }
    if (!transfer && merchantReference) {
      const byRef = await supabase.from("transfers").select("*").eq("provider_reference", merchantReference).maybeSingle();
      transfer = byRef.data;
    }

    if (!transfer) {
      console.warn("Elicate webhook: no transfer or charge", { providerRef, merchantReference, eventType });
      return new Response(JSON.stringify({ received: true, matched: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isSuccess) {
      if (transfer.status === "completed") {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: elicateAcc } = await supabase.from("ledger_accounts").select("id").eq("code", "1205").maybeSingle();
      const { data: walletLiab } = await supabase
        .from("ledger_accounts").select("id").like("code", "21%").eq("currency_code", "ZMW").limit(1).single();

      if (!elicateAcc || !walletLiab) {
        return new Response(JSON.stringify({ error: "Ledger setup incomplete" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const journalId = crypto.randomUUID();
      const amount = Number(transfer.target_amount);
      const entries = [
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

      const { data: payableAcc } = await supabase.from("ledger_accounts").select("id").eq("code", "2123").maybeSingle();
      if (payableAcc) {
        entries[0].account_id = payableAcc.id;
        entries[0].description = `Clear ZMW payable for ${transfer.recipient_name}`;
      }

      const { data: existingSettle } = await supabase
        .from("ledger_entries").select("id")
        .eq("reference_type", "elicate_payout").eq("reference_id", transfer.id).limit(1);
      if (!existingSettle?.length) {
        const { error: leErr } = await supabase.from("ledger_entries").insert(entries);
        if (leErr) {
          return new Response(JSON.stringify({ error: "Ledger post failed" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", transfer.id);
    } else if (isFailure) {
      await reverseTransferLedger(supabase, String(transfer.id));
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: data.reason || data.message || "Elicate payout failed",
      }).eq("id", transfer.id);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("elicate-webhook error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
