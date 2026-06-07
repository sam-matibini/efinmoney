// Creates a Crossmint headless checkout order that funds USDC into the
// user's Crossmint Smart Wallet. The webhook later sweeps that USDC to the
// Yellow Card Stellar deposit address.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getOrCreateCrossmintWallet } from "../_shared/crossmint-wallet.ts";

const STAGING_USDC_TOKEN_LOCATORS = {
  solana: "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  base: "base-sepolia:0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  stellar: "stellar:CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
} as const;

const PRODUCTION_USDC_TOKEN_LOCATORS = {
  solana: "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  base: "base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  stellar: "stellar:CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SMHHQK",
} as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? "";

    const body = await req.json();
    const {
      source_currency,
      source_amount,
      destination_currency = "NGN",
      destination_country = "NG",
      destination_amount,
      fx_rate,
      fee_amount = 0,
      recipient_name,
      recipient_bank_name,
      recipient_bank_code,
      recipient_account_number,
      recipient_phone,
      recipient_email,
    } = body ?? {};

    if (!source_currency || !source_amount || !recipient_name || !recipient_account_number) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!["USD", "CAD"].includes(source_currency)) {
      return json({ error: "source_currency must be USD or CAD" }, 400);
    }

    const admin = createClient(supabaseUrl, service);

    // Insert pending transfer row
    const { data: transfer, error: insErr } = await admin
      .from("crossmint_yellowcard_transfers")
      .insert({
        user_id: userId,
        source_currency,
        source_amount,
        destination_currency,
        destination_country,
        destination_amount,
        fx_rate,
        fee_amount,
        recipient_name,
        recipient_bank_name,
        recipient_bank_code,
        recipient_account_number,
        recipient_phone,
        recipient_email,
        status: "pending",
      })
      .select()
      .single();

    if (insErr || !transfer) {
      console.error("insert error", insErr);
      return json({ error: "Could not create transfer" }, 500);
    }

    const apiKey = Deno.env.get("CROSSMINT_API_KEY")!;
    const env = ((Deno.env.get("CROSSMINT_ENV") ?? "staging").toLowerCase()) as
      | "staging"
      | "production";

    // Crossmint Orders API only accepts Solana + EVM token locators (Stellar is
    // not supported by the orders endpoint, even though wallets can be Stellar).
    // Default to Base for production cards.
    const requestedChain = (Deno.env.get("CROSSMINT_USDC_CHAIN") ?? "base").toLowerCase();
    const chain = requestedChain === "solana" ? "solana" : "base";
    const tokenLocator =
      env === "production"
        ? PRODUCTION_USDC_TOKEN_LOCATORS[chain as keyof typeof PRODUCTION_USDC_TOKEN_LOCATORS] ?? PRODUCTION_USDC_TOKEN_LOCATORS.base
        : STAGING_USDC_TOKEN_LOCATORS[chain as keyof typeof STAGING_USDC_TOKEN_LOCATORS] ?? STAGING_USDC_TOKEN_LOCATORS.base;

    // Provision (or fetch) the user's Crossmint Smart Wallet on the target
    // chain. USDC purchased through the order is delivered into this wallet,
    // which is then swept to Yellow Card by the webhook.
    let smartWallet;
    try {
      smartWallet = await getOrCreateCrossmintWallet({
        admin,
        apiKey,
        env,
        userId,
        userEmail,
        chain,
      });
    } catch (e) {
      await admin
        .from("crossmint_yellowcard_transfers")
        .update({ status: "failed", failure_reason: String(e) })
        .eq("id", transfer.id);
      console.error("crossmint smart wallet provisioning failed", e);
      return json({ error: "Could not provision smart wallet", details: String(e) }, 502);
    }

    await admin
      .from("crossmint_yellowcard_transfers")
      .update({ smart_wallet_address: smartWallet.address })
      .eq("id", transfer.id);

    const orderBody = {
      recipient: { walletAddress: smartWallet.address },
      payment: {
        method: "card",
        receiptEmail: userEmail || recipient_email || undefined,
      },
      lineItems: [
        {
          tokenLocator,
          executionParameters: {
            mode: "exact-in",
            amount: String(source_amount),
          },
        },
      ],
      metadata: {
        transfer_id: transfer.id,
        user_id: userId,
        crossmint_chain: chain,
        smart_wallet: smartWallet.address,
        source_currency: source_currency.toLowerCase(),
        destination_country,
        destination_currency,
      },
    };

    const base =
      env === "production"
        ? "https://www.crossmint.com/api"
        : "https://staging.crossmint.com/api";

    const resp = await fetch(`${base}/2022-06-09/orders`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderBody),
    });

    const orderData = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      await admin
        .from("crossmint_yellowcard_transfers")
        .update({ status: "failed", failure_reason: JSON.stringify(orderData), crossmint_raw: orderData })
        .eq("id", transfer.id);
      console.error("crossmint order failed", resp.status, {
        env,
        chain,
        tokenLocator,
        smartWallet: smartWallet.address,
        smartWalletLocator: smartWallet.locator,
        apiKeyPrefix: apiKey.slice(0, 12),
        apiKeyLength: apiKey.length,
        orderData,
      });
      return json({ error: "Crossmint order failed", details: orderData }, 502);
    }

    const orderId = orderData?.order?.orderId ?? orderData?.orderId;
    const checkoutUrl =
      orderData?.order?.payment?.preparation?.stripeClientSecret
        ? null
        : orderData?.order?.checkout?.url ?? orderData?.checkoutUrl ?? null;
    const clientSecret = orderData?.clientSecret ?? orderData?.order?.clientSecret ?? null;

    await admin
      .from("crossmint_yellowcard_transfers")
      .update({
        crossmint_order_id: orderId,
        crossmint_checkout_url: checkoutUrl,
        crossmint_raw: orderData,
      })
      .eq("id", transfer.id);

    return json({
      transfer_id: transfer.id,
      order_id: orderId,
      checkout_url: checkoutUrl,
      client_secret: clientSecret,
      client_api_key: Deno.env.get("CROSSMINT_CLIENT_API_KEY") ?? null,
      env,
    });
  } catch (e) {
    console.error("crossmint-create-order error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
