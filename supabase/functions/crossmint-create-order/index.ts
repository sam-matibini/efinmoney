// Creates a Crossmint headless checkout order that funds USDC using the
// sender's card. Returns checkout URL + client secret for the embedded
// experience.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STAGING_USDC_TOKEN_LOCATORS = {
  solana: "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  base: "base-sepolia:0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  stellar: "stellar:CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
} as const;

const PRODUCTION_USDC_TOKEN_LOCATORS = {
  solana: "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  base: "base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
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
    const env = (Deno.env.get("CROSSMINT_ENV") ?? "staging").toLowerCase();
    const base =
      env === "production"
        ? "https://www.crossmint.com/api"
        : "https://staging.crossmint.com/api";

    const requestedChain = (Deno.env.get("CROSSMINT_USDC_CHAIN") ?? "base").toLowerCase();
    const chain = requestedChain === "stellar" || requestedChain === "solana" ? requestedChain : "base";
    const tokenLocator =
      env === "production"
        ? PRODUCTION_USDC_TOKEN_LOCATORS[chain as keyof typeof PRODUCTION_USDC_TOKEN_LOCATORS] ?? PRODUCTION_USDC_TOKEN_LOCATORS.base
        : STAGING_USDC_TOKEN_LOCATORS[chain as keyof typeof STAGING_USDC_TOKEN_LOCATORS];

    // Treasury wallet address that will receive the USDC.
    // Crossmint's create-order flow expects a supported token locator and a
    // recipient wallet address on the matching chain.
    const orderBody = {
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
        source_currency: source_currency.toLowerCase(),
        destination_country,
        destination_currency,
      },
    };

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
