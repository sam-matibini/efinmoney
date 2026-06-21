import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getElicateConfig } from "../_shared/elicate.ts";

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

  // Health check for browser GETs / Elicate dashboard verification pings.
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
    const sigHeaderNames = [
      "x-elicatepay-signature",
      "x-elicate-signature",
      "verif-hash",
      "x-webhook-signature",
      "x-signature",
    ];
    let signature = "";
    let sigHeaderUsed = "";
    for (const h of sigHeaderNames) {
      const v = req.headers.get(h);
      if (v) { signature = v.trim(); sigHeaderUsed = h; break; }
    }
    // Strip common prefixes like "sha256=" or "t=..,v1=.."
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

    // Accept any of: shared-token equality, HMAC-SHA256(body), HMAC-SHA256(body) with sha256= prefix.
    const expectedHmac = await hmacHex(webhookSecret, rawBody);
    const sigValid =
      !!signature && (
        signature === webhookSecret ||
        sigClean.toLowerCase() === webhookSecret.toLowerCase() ||
        sigClean.toLowerCase() === expectedHmac.toLowerCase()
      );

    if (!sigValid) {
      console.warn("Invalid Elicate webhook signature", {
        mode,
        headerUsed: sigHeaderUsed || "(none)",
        receivedPreview: signature ? `${signature.slice(0, 8)}…(${signature.length})` : "(empty)",
        expectedHmacPreview: `${expectedHmac.slice(0, 8)}…`,
        bodyBytes: rawBody.length,
        allHeaders: Array.from(req.headers.keys()),
      });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Elicate webhook signature OK", { mode, headerUsed: sigHeaderUsed });

    const payload = JSON.parse(rawBody);
    const eventType: string = payload.event || payload.type || "";
    const data = payload.data || payload;
    const providerRef: string | undefined =
      data.transaction_id || data.transactionId || data.id;
    const merchantReference: string | undefined = data.reference;

    if (!providerRef && !merchantReference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isSuccess = (() => {
      const successEvents = ["payout.successful", "payout.success", "charge.successful", "charge.success", "payment.successful", "payment.success"];
      if (successEvents.includes(eventType)) return true;
      const s = String(data.status ?? "").toLowerCase();
      return ["successful", "success", "completed"].includes(s);
    })();
    const isFailure = (() => {
      const failureEvents = ["payout.failed", "payout.failure", "charge.failed", "payment.failed"];
      if (failureEvents.includes(eventType)) return true;
      const s = String(data.status ?? "").toLowerCase();
      return ["failed", "failure"].includes(s);
    })();

    // ----------------------------------------------------------------
    // First check if this references an inbound CHARGE (top-up). If so,
    // handle it and return — otherwise fall through to the payout/transfer
    // lookup below. References are unique across both tables.
    // ----------------------------------------------------------------
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
      // Idempotency
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
        if (!charge.target_wallet_id) {
          console.error("Elicate charge has no target wallet", charge.id);
          return new Response(JSON.stringify({ error: "Charge has no target wallet" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: clearing } = await supabase
          .from("ledger_accounts").select("id").eq("code", "1205").maybeSingle();
        const { data: liability } = await supabase
          .from("ledger_accounts").select("id").eq("code", "2108").maybeSingle();

        if (!clearing || !liability) {
          console.error("Missing ledger accounts for Elicate charge settlement (1205/2108)");
          return new Response(JSON.stringify({ error: "Ledger setup incomplete" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const amountMajor = Number(charge.amount_minor) / 100;
        const journalId = crypto.randomUUID();
        const desc = `Elicate top-up (${providerRef ?? merchantReference})`;

        // Inbound credit: the user paid Elicate via mobile money, Elicate's float grew,
        // and the user's wallet balance must grow to match. Mirror of the payout entries.
        const entries = [
          {
            journal_id: journalId,
            account_id: clearing.id,
            wallet_id: null,
            currency_code: "ZMW",
            debit_amount: amountMajor,
            credit_amount: 0,
            description: desc,
            reference_type: "elicate_topup",
            reference_id: charge.id,
            external_reference: providerRef ?? merchantReference ?? null,
            created_by: charge.user_id,
          },
          {
            journal_id: journalId,
            account_id: liability.id,
            wallet_id: charge.target_wallet_id,
            currency_code: "ZMW",
            debit_amount: 0,
            credit_amount: amountMajor,
            description: desc,
            reference_type: "elicate_topup",
            reference_id: charge.id,
            external_reference: providerRef ?? merchantReference ?? null,
            created_by: charge.user_id,
          },
        ];

        const { error: leErr } = await supabase.from("ledger_entries").insert(entries);
        if (leErr) {
          console.error("Ledger insert failed (charge):", leErr);
          return new Response(JSON.stringify({ error: "Ledger post failed" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase.from("elicate_charges").update({
          status: "completed",
          psp_reference: providerRef ?? charge.psp_reference,
          last_event: data,
        }).eq("id", charge.id);

        await supabase.from("notifications").insert({
          user_id: charge.user_id,
          title: "Wallet Topped Up",
          message: `Your ZMW wallet has been credited ${amountMajor.toLocaleString()} ZMW.`,
          type: "wallet",
          is_read: false,
        }).then(() => null, () => null);

        return new Response(JSON.stringify({ received: true, kind: "charge", outcome: "completed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Neither success nor failure (intermediate state) — just log the event.
      await supabase.from("elicate_charges").update({ last_event: data }).eq("id", charge.id);
      return new Response(JSON.stringify({ received: true, kind: "charge", outcome: "noop" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ----------------------------------------------------------------
    // Not a charge — fall through to existing outbound TRANSFER lookup.
    // ----------------------------------------------------------------
    let transfer: any = null;

    if (providerRef) {
      const { data } = await supabase
        .from("transfers")
        .select("*")
        .eq("provider_reference", providerRef)
        .maybeSingle();
      transfer = data;
    }

    if (!transfer && merchantReference) {
      const byId = await supabase
        .from("transfers")
        .select("*")
        .eq("id", merchantReference)
        .maybeSingle();
      transfer = byId.data;
    }

    if (!transfer && merchantReference) {
      const byProviderRef = await supabase
        .from("transfers")
        .select("*")
        .eq("provider_reference", merchantReference)
        .maybeSingle();
      transfer = byProviderRef.data;
    }

    if (!transfer) {
      console.warn("Elicate webhook: no transfer or charge for refs", { providerRef, merchantReference });
      return new Response(JSON.stringify({ received: true, matched: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
