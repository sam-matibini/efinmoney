import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-elicate-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-elicate-signature") ||
      req.headers.get("X-Elicate-Signature") ||
      req.headers.get("verif-hash") ||
      "";

    const webhookSecret = Deno.env.get("ELICATE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("ELICATE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Accept either an HMAC-SHA256 signature of the body, or a shared-token style header.
    const expectedHmac = await hmacHex(webhookSecret, rawBody);
    const sigValid =
      signature === webhookSecret ||
      signature === expectedHmac ||
      signature.toLowerCase() === expectedHmac.toLowerCase();

    if (!sigValid) {
      console.warn("Invalid Elicate webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(rawBody);
    const eventType: string = payload.event || payload.type || "";
    const data = payload.data || payload;
    const providerRef: string | undefined =
      data.transaction_id || data.transactionId || data.reference || data.id;

    if (!providerRef) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Locate the originating transfer
    const { data: transfer } = await supabase
      .from("transfers")
      .select("*")
      .eq("provider_reference", providerRef)
      .maybeSingle();

    if (!transfer) {
      console.warn("Elicate webhook: no transfer for ref", providerRef);
      return new Response(JSON.stringify({ received: true, matched: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const successEvents = ["payout.successful", "payout.success", "charge.successful", "charge.success", "payment.successful", "payment.success"];
    const failureEvents = ["payout.failed", "payout.failure", "charge.failed", "payment.failed"];
    const isSuccess = successEvents.includes(eventType) || (data.status && ["successful", "success", "completed"].includes(String(data.status).toLowerCase()));
    const isFailure = failureEvents.includes(eventType) || (data.status && ["failed", "failure"].includes(String(data.status).toLowerCase()));

    if (isSuccess) {
      // Idempotency: skip if already completed
      if (transfer.status === "completed") {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Look up accounts: Elicate Settlement (1205) and the user's ZMW wallet liability
      const { data: elicateAcc } = await supabase
        .from("ledger_accounts").select("id").eq("code", "1205").maybeSingle();

      const { data: walletLiab } = await supabase
        .from("ledger_accounts").select("id")
        .like("code", "21%").eq("currency_code", "ZMW").limit(1).single();

      if (!elicateAcc || !walletLiab) {
        console.error("Missing ledger accounts for Elicate settlement");
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

      // Note: original transfer post debits the wallet liability and credits the 2123 payable.
      // On settlement we reverse the payable (debit) and credit the Elicate clearing asset.
      // Above entries clear the 21xx payable proxy — adjust if your COA uses a distinct ZMW payable (2123).
      const { data: payableAcc } = await supabase
        .from("ledger_accounts").select("id").eq("code", "2123").maybeSingle();
      if (payableAcc) {
        entries[0].account_id = payableAcc.id;
        entries[0].description = `Clear ZMW payable for ${transfer.recipient_name}`;
      }

      const { error: leErr } = await supabase.from("ledger_entries").insert(entries);
      if (leErr) {
        console.error("Ledger insert failed:", leErr);
        return new Response(JSON.stringify({ error: "Ledger post failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", transfer.id);
    } else if (isFailure) {
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
