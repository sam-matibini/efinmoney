// SEP-31 cross-border anchor flow:
//   1. SEP-10 auth (challenge -> sign -> exchange for JWT)
//   2. POST /transactions with recipient bank details
//   3. Pay the anchor's deposit address in USDC over Stellar
// Idempotent on transfer_id via transfers.stellar_tx_hash.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as StellarSdk from "npm:stellar-sdk@12";
import { z } from "npm:zod@3";
import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  EXPLORER_BASE,
  usdcAsset,
  USDC_ASSET_CODE,
  USDC_ISSUER,
} from "../_shared/stellar-network.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENC_KEY = Deno.env.get("STELLAR_ENCRYPTION_KEY")!;

// Anchor config (env-driven; swap per partner / mainnet)
const ANCHOR_HOME_DOMAIN = Deno.env.get("STELLAR_ANCHOR_DOMAIN") ?? "";
const ANCHOR_AUTH_URL = Deno.env.get("STELLAR_ANCHOR_AUTH_URL") ?? "";
const ANCHOR_SEP31_URL = Deno.env.get("STELLAR_ANCHOR_SEP31_URL") ?? "";

const BodySchema = z.object({
  transfer_id: z.string().uuid(),
});

async function getKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(ENC_KEY);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function decryptSeed(encrypted: string): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const key = await getKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// --- SEP-10: get a JWT from the anchor ---
async function sep10Authenticate(
  authUrl: string,
  keypair: StellarSdk.Keypair,
): Promise<string> {
  // 1. Request challenge
  const cRes = await fetch(`${authUrl}?account=${keypair.publicKey()}`);
  if (!cRes.ok) throw new Error(`Anchor /auth challenge failed: ${cRes.status} ${await cRes.text()}`);
  const { transaction: challengeXdr, network_passphrase } = await cRes.json();
  if (!challengeXdr) throw new Error("Anchor did not return a challenge");

  // 2. Sign challenge
  const tx = new StellarSdk.Transaction(
    challengeXdr,
    network_passphrase ?? NETWORK_PASSPHRASE,
  );
  tx.sign(keypair);
  const signedXdr = tx.toXDR();

  // 3. Exchange for JWT
  const tRes = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signedXdr }),
  });
  if (!tRes.ok) throw new Error(`Anchor /auth token failed: ${tRes.status} ${await tRes.text()}`);
  const { token } = await tRes.json();
  if (!token) throw new Error("Anchor did not return a JWT");
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { transfer_id } = parsed.data;

    if (!ANCHOR_AUTH_URL || !ANCHOR_SEP31_URL) {
      return new Response(JSON.stringify({
        error: "Anchor not configured. Set STELLAR_ANCHOR_AUTH_URL and STELLAR_ANCHOR_SEP31_URL.",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Rate limit
    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `stellar_anchor:${user.id}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load transfer
    const { data: transfer, error: tErr } = await admin
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .eq("sender_id", user.id)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!transfer) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency
    if (transfer.stellar_tx_hash) {
      return new Response(JSON.stringify({
        success: true,
        already_sent: true,
        stellar_tx_hash: transfer.stellar_tx_hash,
        explorerUrl: `${EXPLORER_BASE}/tx/${transfer.stellar_tx_hash}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load sender keys
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stellar_public_key, stellar_seed_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile?.stellar_public_key || !profile?.stellar_seed_encrypted) {
      return new Response(JSON.stringify({ error: "No Stellar wallet on this account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const seed = await decryptSeed(profile.stellar_seed_encrypted);
    const keypair = StellarSdk.Keypair.fromSecret(seed);

    // --- 1. SEP-10 auth ---
    const jwt = await sep10Authenticate(ANCHOR_AUTH_URL, keypair);

    // --- 2. SEP-31 POST /transactions ---
    const amount = String(transfer.target_amount ?? transfer.source_amount);
    const sep31Body = {
      amount,
      asset_code: USDC_ASSET_CODE,
      asset_issuer: USDC_ISSUER,
      sender_id: user.id,
      receiver_id: transfer.recipient_id ?? transfer.id,
      fields: {
        transaction: {
          receiver_account_number: transfer.recipient_account,
          receiver_routing_number: transfer.recipient_bank_code,
          receiver_bank_name: transfer.recipient_bank_name ?? null,
          receiver_name: transfer.recipient_name,
          receiver_phone: transfer.recipient_phone,
          receiver_country: transfer.recipient_country ?? "NG",
          purpose_of_payment: transfer.purpose ?? "family_support",
        },
      },
    };

    const sep31Res = await fetch(`${ANCHOR_SEP31_URL}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(sep31Body),
    });
    if (!sep31Res.ok) {
      const text = await sep31Res.text();
      throw new Error(`Anchor /transactions failed: ${sep31Res.status} ${text}`);
    }
    const sep31Json = await sep31Res.json();
    const anchorTxId: string = sep31Json.id ?? sep31Json.transaction_id;
    const depositAddress: string = sep31Json.stellar_account_id;
    const depositMemo: string | undefined = sep31Json.stellar_memo;
    const depositMemoType: string | undefined = sep31Json.stellar_memo_type;

    if (!depositAddress) throw new Error("Anchor did not return a deposit address");

    // --- 3. Send USDC payment ---
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    const account = await server.loadAccount(keypair.publicKey());
    const fee = await server.fetchBaseFee();

    const builder = new StellarSdk.TransactionBuilder(account, {
      fee: String(fee),
      networkPassphrase: NETWORK_PASSPHRASE,
    }).addOperation(
      StellarSdk.Operation.payment({
        destination: depositAddress,
        asset: usdcAsset(),
        amount,
      }),
    );

    if (depositMemo) {
      const memo = depositMemoType === "hash"
        ? StellarSdk.Memo.hash(depositMemo)
        : depositMemoType === "id"
        ? StellarSdk.Memo.id(depositMemo)
        : StellarSdk.Memo.text(depositMemo);
      builder.addMemo(memo);
    }

    const tx = builder.setTimeout(120).build();
    tx.sign(keypair);

    let submit: any;
    try {
      submit = await server.submitTransaction(tx);
    } catch (err: any) {
      const data = err?.response?.data ?? err?.data;
      console.error("Anchor payment submit error:", JSON.stringify(data ?? err));
      await admin.from("transfers").update({
        status: "failed",
        failure_reason: `Stellar payment failed: ${data?.title ?? err?.message ?? "unknown"}`,
      }).eq("id", transfer_id);
      return new Response(JSON.stringify({
        success: false,
        error: "Stellar payment failed",
        codes: data?.extras?.result_codes,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const txHash: string = submit.hash;

    // Persist hash + anchor reference
    await admin.from("transfers").update({
      stellar_tx_hash: txHash,
      provider_reference: anchorTxId ?? txHash,
      status: "processing",
    }).eq("id", transfer_id);

    return new Response(JSON.stringify({
      success: true,
      stellar_tx_hash: txHash,
      anchor_transaction_id: anchorTxId,
      explorerUrl: `${EXPLORER_BASE}/tx/${txHash}`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("stellar-anchor-transfer error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
