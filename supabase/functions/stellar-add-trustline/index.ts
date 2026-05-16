import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as StellarSdk from "npm:stellar-sdk@12";
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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Rate-limit: 5 trustline ops per 5 minutes per user
    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `stellar_trustline:${user.id}`,
      p_max_requests: 5,
      p_window_seconds: 300,
    });
    if (rl === false) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("stellar_public_key, stellar_seed_encrypted")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile?.stellar_public_key || !profile?.stellar_seed_encrypted) {
      return new Response(JSON.stringify({ error: "No Stellar wallet found. Generate one first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const seed = await decryptSeed(profile.stellar_seed_encrypted);
    const keypair = StellarSdk.Keypair.fromSecret(seed);
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);

    let account;
    try {
      account = await server.loadAccount(keypair.publicKey());
    } catch (_e) {
      return new Response(JSON.stringify({
        error: "Account not funded yet. Wait for Friendbot funding to complete.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Already has the trustline?
    const hasTrustline = (account.balances ?? []).some(
      (b: any) => b.asset_code === USDC_ASSET_CODE && b.asset_issuer === USDC_ISSUER,
    );
    if (hasTrustline) {
      return new Response(JSON.stringify({
        success: true,
        already_existed: true,
        asset_code: USDC_ASSET_CODE,
        issuer: USDC_ISSUER,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fee = await server.fetchBaseFee();
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: String(fee),
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(StellarSdk.Operation.changeTrust({ asset: usdcAsset() }))
      .setTimeout(60)
      .build();

    tx.sign(keypair);

    let result: any;
    try {
      result = await server.submitTransaction(tx);
    } catch (err: any) {
      const data = err?.response?.data ?? err?.data;
      const codes = data?.extras?.result_codes;
      console.error("Trustline submit error:", JSON.stringify(data ?? err));
      return new Response(JSON.stringify({
        error: "Stellar trustline failed",
        codes,
        detail: data?.title ?? String(err?.message ?? err),
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      hash: result.hash,
      asset_code: USDC_ASSET_CODE,
      issuer: USDC_ISSUER,
      explorerUrl: `${EXPLORER_BASE}/tx/${result.hash}`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("stellar-add-trustline error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
