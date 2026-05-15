import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map destination currency -> mobile money payable account code
const PAYABLE_BY_CURRENCY: Record<string, string> = {
  KES: "2120",
  UGX: "2121",
  TZS: "2122",
  ZMW: "2123",
  BIF: "2124",
  NGN: "2125",
};

// Map our internal payout_method codes -> Flutterwave network token used by V3_MM_BANK
const PAYOUT_METHOD_TO_NETWORK: Record<string, string> = {
  mtn_mobile: "mtn",
  airtel_money: "airtel",
  zamtel_money: "zamtel",
  vodafone_cash: "vodafone",
  tigo_pesa: "tigo",
  mpesa: "mpesa",
  bank: "bank",
};

// Fallback default network per destination currency when payout_method is generic ("mobile_money") or unknown
const CURRENCY_DEFAULT_NETWORK: Record<string, string> = {
  KES: "mpesa",
  ZMW: "mtn",
  GHS: "mtn",
  UGX: "mtn",
  TZS: "airtel",
  RWF: "mtn",
};

function resolveNetwork(payoutMethod: string | null | undefined, currency: string): string {
  if (payoutMethod && PAYOUT_METHOD_TO_NETWORK[payoutMethod]) {
    return PAYOUT_METHOD_TO_NETWORK[payoutMethod];
  }
  return CURRENCY_DEFAULT_NETWORK[currency] || "mpesa";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transfer_id } = await req.json();
    if (!transfer_id) {
      return new Response(JSON.stringify({ error: "transfer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load transfer
    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .eq("sender_id", user.id)
      .single();

    if (tErr || !transfer) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (transfer.status !== "initiated") {
      return new Response(JSON.stringify({ error: `Transfer already ${transfer.status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Number(transfer.target_amount) || Number(transfer.target_amount) <= 0) {
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: "Amount too small after fees — recipient would receive 0",
      }).eq("id", transfer_id);
      return new Response(JSON.stringify({
        error: "Amount too small: after fees the recipient would receive 0. Please increase the send amount.",
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull payload (card token, etc.) sent by the frontend — we need funding_source up front
    let payload: Record<string, any> = {};
    try {
      const reqClone = req.clone();
      payload = (await reqClone.json().catch(() => ({}))) || {};
    } catch { /* ignore */ }
    const isCardFunded = (payload.funding_source || transfer.funding_source) === "card";

    // For card-funded transfers, charge the sender's card BEFORE posting any ledger.
    // If the charge fails, we never touch the ledger and the transfer is marked failed.
    if (isCardFunded) {
      const cardToken = payload.card_token;
      if (!cardToken) {
        await supabase.from("transfers").update({
          status: "failed", failure_reason: "Missing card token for card-funded transfer",
        }).eq("id", transfer_id);
        return new Response(JSON.stringify({ success: false, error: "card_token required for card funding" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const totalCents = Math.round((Number(transfer.source_amount) + Number(transfer.fee_amount || 0)) * 100);
      const chargeRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-charge-card`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transfer_id,
            card_token: cardToken,
            amount_cents: totalCents,
            currency: (transfer.source_currency || "cad").toLowerCase(),
          }),
        },
      );
      const chargeJson = await chargeRes.json();
      if (!chargeJson?.success) {
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: chargeJson?.error || "Card charge failed",
        }).eq("id", transfer_id);
        return new Response(JSON.stringify({
          success: false,
          error: chargeJson?.error || "Card charge failed",
          code: chargeJson?.code,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Idempotency: skip if already has a journal posted
    const { data: existing } = await supabase
      .from("ledger_entries")
      .select("id")
      .eq("reference_type", "transfer")
      .eq("reference_id", transfer_id)
      .limit(1);

    if (!existing || existing.length === 0) {
      // Look up debit account: card-funded → 1102 Stripe Card Receivable;
      // wallet-funded → customer wallet liability (21xx).
      const liabLookup = isCardFunded
        ? await supabase.from("ledger_accounts").select("id").eq("code", "1102").maybeSingle()
        : await supabase.from("ledger_accounts").select("id")
            .like("code", "21%").eq("currency_code", transfer.source_currency).limit(1).single();
      const liabAcc = liabLookup.data;

      const payableCode = PAYABLE_BY_CURRENCY[transfer.target_currency];
      const { data: payableAcc } = payableCode
        ? await supabase.from("ledger_accounts").select("id").eq("code", payableCode).maybeSingle()
        : { data: null };

      const { data: feeAcc } = await supabase
        .from("ledger_accounts").select("id").eq("code", "4200").maybeSingle();

      if (!liabAcc) {
        return new Response(JSON.stringify({ error: `No ledger account for ${transfer.source_currency}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const journalId = crypto.randomUUID();
      const totalDebit = Number(transfer.source_amount) + Number(transfer.fee_amount || 0);

      const entries: any[] = [
        {
          journal_id: journalId,
          account_id: liabAcc.id,
          wallet_id: transfer.sender_wallet_id,
          currency_code: transfer.source_currency,
          debit_amount: totalDebit,
          credit_amount: 0,
          description: `Transfer to ${transfer.recipient_name} (${transfer.recipient_country})`,
          reference_type: "transfer",
          reference_id: transfer_id,
          created_by: user.id,
        },
      ];

      if (payableAcc) {
        entries.push({
          journal_id: journalId,
          account_id: payableAcc.id,
          wallet_id: null,
          currency_code: transfer.target_currency,
          debit_amount: 0,
          credit_amount: Number(transfer.target_amount),
          description: `Payable to ${transfer.recipient_name}`,
          reference_type: "transfer",
          reference_id: transfer_id,
          created_by: user.id,
        });
      }

      if (feeAcc && Number(transfer.fee_amount) > 0) {
        entries.push({
          journal_id: journalId,
          account_id: feeAcc.id,
          wallet_id: null,
          currency_code: transfer.source_currency,
          debit_amount: 0,
          credit_amount: Number(transfer.fee_amount),
          description: "Transfer fee revenue",
          reference_type: "transfer",
          reference_id: transfer_id,
          created_by: user.id,
        });
      }

      const { error: leErr } = await supabase.from("ledger_entries").insert(entries);
      if (leErr) {
        console.error("Ledger insert error:", leErr);
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: leErr.message,
        }).eq("id", transfer_id);
        return new Response(JSON.stringify({ error: "Failed to post ledger" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Mark funded
    await supabase.from("transfers").update({ status: "funded" }).eq("id", transfer_id);

    // Trigger payout: Stripe (card push) → Paysafe (Interac/EFT) for Canada;
    // Flutterwave hosted checkout for African corridors (initiated from frontend).
    let payoutResult: any = { stub: true };
    try {
      const isCanada = transfer.transfer_type === "domestic_canada" || transfer.recipient_country === "CA";
      // Pull optional payout payload (card token etc.) sent by the frontend
      let extraBody: Record<string, unknown> = {};
      try {
        const reqClone = req.clone();
        const json = await reqClone.json().catch(() => ({}));
        extraBody = {
          card_token: json?.card_token,
          recipient_email: json?.recipient_email,
          last4: json?.last4,
          brand: json?.brand,
        };
      } catch { /* ignore */ }

      if (isCanada && transfer.payout_method === "card_push") {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-payout`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transfer_id, ...extraBody }),
          },
        );
        payoutResult = await res.json();
      } else if (isCanada) {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/paysafe-payout`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transfer_id }),
          },
        );
        payoutResult = await res.json();
      } else {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/flutterwave-payout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: req.headers.get("Authorization") || "",
            },
            body: JSON.stringify({
              transfer_id,
              phone_number: transfer.recipient_phone,
              account_number: transfer.recipient_account,
              bank_code: transfer.recipient_bank_code,
              amount: Number(transfer.target_amount ?? transfer.source_amount),
              currency: transfer.target_currency ?? transfer.source_currency,
              network: resolveNetwork(transfer.payout_method, transfer.target_currency ?? transfer.source_currency),
              recipient_name: transfer.recipient_name,
            }),
          },
        );
        payoutResult = await res.json();
      }
    } catch (e) {
      console.error("Payout trigger error:", e);
    }

    if (payoutResult && payoutResult.success === false) {
      return new Response(JSON.stringify({
        success: false,
        error: payoutResult.error || "Payout failed",
        code: payoutResult.code,
        refunded: payoutResult.refunded,
        payout: payoutResult,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, payout: payoutResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("execute-transfer error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
