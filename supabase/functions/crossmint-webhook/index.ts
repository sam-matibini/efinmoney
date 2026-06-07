// Crossmint webhook receiver
// Public URL: https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/crossmint-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { crossmintWalletTransfer } from "../_shared/crossmint-wallet.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-crossmint-signature, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STAGING_USDC_TOKEN_LOCATORS: Record<string, string> = {
  stellar: "stellar:CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  base: "base-sepolia:0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  solana: "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};
const PRODUCTION_USDC_TOKEN_LOCATORS: Record<string, string> = {
  stellar: "stellar:CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SMHHQK",
  base: "base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  solana: "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    // TODO: verify signature with CROSSMINT_WEBHOOK_SECRET

    let event: any = {};
    try {
      event = JSON.parse(rawBody);
    } catch {
      return jsonResp({ error: "invalid json" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase
      .from("webhook_events")
      .insert({ provider: "crossmint", event_type: event?.type ?? "unknown", payload: event })
      .then(() => {}, () => {});

    const type: string = event?.type ?? "";
    const orderId: string | undefined =
      event?.data?.order?.orderId ?? event?.data?.orderId ?? event?.data?.id;

    if (!orderId) return jsonResp({ received: true, note: "no orderId" });

    let newStatus: string | null = null;
    if (type.includes("payment.succeeded")) newStatus = "card_charged";
    else if (type.includes("delivery.completed")) newStatus = "usdc_received";
    else if (type.includes("payment.failed") || type.includes("order.failed")) newStatus = "failed";

    if (!newStatus) return jsonResp({ received: true });

    await supabase
      .from("crossmint_yellowcard_transfers")
      .update({
        status: newStatus,
        crossmint_raw: event,
        updated_at: new Date().toISOString(),
      })
      .eq("crossmint_order_id", orderId);

    if (newStatus !== "usdc_received") return jsonResp({ received: true });

    // === USDC delivered into user's Crossmint Smart Wallet ===
    // Step 1: sweep it to Yellow Card's Stellar deposit address
    // Step 2: trigger Yellow Card payout
    const { data: t } = await supabase
      .from("crossmint_yellowcard_transfers")
      .select("id, user_id, source_amount, smart_wallet_address")
      .eq("crossmint_order_id", orderId)
      .maybeSingle();

    if (!t?.id) return jsonResp({ received: true, note: "transfer not found" });

    const apiKey = Deno.env.get("CROSSMINT_API_KEY")!;
    const env = ((Deno.env.get("CROSSMINT_ENV") ?? "staging").toLowerCase()) as
      | "staging"
      | "production";
    const chain = (Deno.env.get("CROSSMINT_USDC_CHAIN") ?? "base").toLowerCase();
    const tokenLocator =
      env === "production"
        ? PRODUCTION_USDC_TOKEN_LOCATORS[chain] ?? PRODUCTION_USDC_TOKEN_LOCATORS.base
        : STAGING_USDC_TOKEN_LOCATORS[chain] ?? STAGING_USDC_TOKEN_LOCATORS.base;

    // Yellow Card deposit address. We prefer a chain-specific override
    // (Base by default) and fall back to the generic / Stellar names for
    // back-compat with any earlier configuration.
    const ycDeposit =
      Deno.env.get("YELLOWCARD_BASE_DEPOSIT_ADDRESS") ??
      Deno.env.get("YELLOWCARD_DEPOSIT_ADDRESS") ??
      Deno.env.get("YELLOWCARD_STELLAR_DEPOSIT_ADDRESS") ??
      Deno.env.get("CROSSMINT_RECIPIENT_WALLET") ??
      "";

    const { data: walletRow } = await supabase
      .from("crossmint_wallets")
      .select("locator,address")
      .eq("user_id", t.user_id)
      .eq("chain", chain)
      .eq("env", env)
      .maybeSingle();

    const walletLocator = walletRow?.locator ?? (t.smart_wallet_address ? `${chain}:${t.smart_wallet_address}` : null);

    if (!ycDeposit || !walletLocator) {
      await supabase
        .from("crossmint_yellowcard_transfers")
        .update({
          status: "pending_payout",
          failure_reason: !ycDeposit
            ? "YELLOWCARD_BASE_DEPOSIT_ADDRESS not configured"
            : "User smart wallet not found",
        })
        .eq("id", t.id);
      return jsonResp({ received: true, note: "sweep skipped" });
    }

    try {
      const { txHash, raw } = await crossmintWalletTransfer({
        apiKey,
        env,
        walletLocator,
        tokenLocator,
        recipient: ycDeposit,
        amount: String(t.source_amount),
      });
      await supabase
        .from("crossmint_yellowcard_transfers")
        .update({
          stellar_tx_hash: txHash,
          payout_tx_hash: txHash,
          crossmint_raw: { ...event, sweep: raw },
        })
        .eq("id", t.id);
    } catch (sweepErr) {
      console.error("smart wallet sweep failed", sweepErr);
      await supabase
        .from("crossmint_yellowcard_transfers")
        .update({ status: "failed", failure_reason: `Sweep to YC failed: ${sweepErr}` })
        .eq("id", t.id);
      return jsonResp({ received: true, error: String(sweepErr) });
    }

    // Step 2: trigger Yellow Card payout
    const ycUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/yellowcard-payout`;
    await fetch(ycUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ transfer_id: t.id }),
    }).catch((e) => console.error("yc trigger failed", e));

    return jsonResp({ received: true, swept: true });
  } catch (err) {
    console.error("crossmint-webhook error", err);
    return jsonResp({ error: String(err) }, 500);
  }
});

function jsonResp(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
