/**
 * Create Interac e-Transfer Request Money (VoPay) for CAD pay-in.
 * Opens embedded bank approval URL; funds settle via VoPay then Autodeposit to Loop.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getLoopCadConfig } from "../_shared/loopCad.ts";
import {
  extractVoPayHostedUrl,
  getVoPayConfig,
  voPayGet,
  voPayPost,
  voPaySuccess,
} from "../_shared/vopay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    if (!getVoPayConfig()) {
      return jsonResponse({
        error:
          "VoPay is not configured. Set VOPAY_ACCOUNT_ID, VOPAY_API_KEY, and VOPAY_API_SHARED_SECRET on Edge Function secrets.",
        code: "vopay_not_configured",
      }, 503);
    }

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      wallet_id?: string;
      amount_cad?: number;
      purpose?: string;
      transfer_id?: string;
      recipient_name?: string;
      email?: string;
      phone?: string;
      language?: string;
    };

    const walletId = String(body.wallet_id || "").trim();
    const amount = Math.round(Number(body.amount_cad) * 100) / 100;
    const purpose = String(body.purpose || "topup").toLowerCase();
    const linkedTransferId = String(body.transfer_id || "").trim();

    if (!walletId || !Number.isFinite(amount) || amount < 1 || amount > 25000) {
      return jsonResponse({ error: "wallet_id and amount_cad (1–25000) required" }, 400);
    }

    const { data: wallet } = await supabase
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", walletId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!wallet || String(wallet.currency_code).toUpperCase() !== "CAD") {
      return jsonResponse({ error: "Destination must be your CAD wallet" }, 400);
    }

    if (purpose === "transfer" && linkedTransferId) {
      const { data: tr } = await supabase
        .from("transfers")
        .select("id, sender_id")
        .eq("id", linkedTransferId)
        .maybeSingle();
      if (!tr || tr.sender_id !== user.id) {
        return jsonResponse({ error: "Transfer not found" }, 404);
      }
    }

    let reference = "";
    const { data: generated } = await supabase.rpc("next_interac_public_id");
    if (typeof generated === "string" && generated) {
      reference = generated;
    } else {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      reference = `EFM-${day}-${String(Date.now() % 100000000).padStart(8, "0")}`;
    }

    const email = String(body.email || user.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "A valid email is required for Interac Request Money" }, 400);
    }

    const recipientName = String(
      body.recipient_name || user.user_metadata?.full_name || email.split("@")[0] || "Customer",
    ).slice(0, 100);

    const loop = getLoopCadConfig();
    const message = `eFinMoney ${reference} → Loop Autodeposit ${loop.alias}`;

    const created = await voPayPost("/interac/money-request", {
      Amount: amount,
      Currency: "CAD",
      EmailAddress: email,
      RecipientName: recipientName,
      PhoneNumber: body.phone ? String(body.phone).replace(/\D/g, "").slice(0, 15) : undefined,
      MessageForRecipient: message,
      ClientReferenceNumber: reference,
      IdempotencyKey: `efm-rfm-${reference}`,
      GenerateURL: true,
      Notes: `purpose=${purpose};wallet=${walletId};transfer=${linkedTransferId || ""}`,
    });

    if (!voPaySuccess(created)) {
      return jsonResponse({
        error: String(created.ErrorMessage || "VoPay money-request failed"),
        vopay: created,
      }, 502);
    }

    const transactionId = String(created.TransactionID ?? "");
    let hostedUrl = extractVoPayHostedUrl(created);

    if (!hostedUrl && transactionId) {
      try {
        const detail = await voPayGet("/interac/money-request/transaction", {
          TransactionID: transactionId,
        });
        hostedUrl = extractVoPayHostedUrl(detail);
      } catch (e) {
        console.warn("vopay-interac-request: transaction lookup", e);
      }
    }

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { data: intent, error: intentErr } = await supabase
      .from("fincra_cad_interac_intents")
      .insert({
        user_id: user.id,
        wallet_id: walletId,
        amount,
        currency_code: "CAD",
        reference,
        public_id: reference,
        status: "awaiting_payment",
        claimed_sent_at: new Date().toISOString(),
        sender_name: recipientName,
        sender_email: email,
        sender_phone: body.phone || null,
        purpose: purpose === "transfer"
          ? "transfer"
          : purpose === "merchant_collection"
          ? "merchant_collection"
          : "topup",
        transfer_id: purpose === "transfer" && linkedTransferId ? linkedTransferId : null,
        provider_reference: transactionId || null,
        hosted_url: hostedUrl,
        expires_at: expiresAt,
      })
      .select("id, reference, public_id, amount, status, hosted_url, provider_reference, expires_at")
      .single();
    if (intentErr) throw intentErr;

    return jsonResponse({
      success: true,
      provider: "vopay",
      settlement: "loop_autodeposit",
      loop_alias: loop.alias,
      loop_eft: loop.eft,
      reference,
      transaction_id: transactionId,
      hosted_url: hostedUrl,
      intent,
      message: hostedUrl
        ? "Approve the Interac Request Money in your bank. Funds settle to Loop Autodeposit after collection."
        : "Interac Request Money sent to your email. Approve it in your bank; funds settle to Loop Autodeposit.",
    });
  } catch (e) {
    console.error("vopay-interac-request", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
