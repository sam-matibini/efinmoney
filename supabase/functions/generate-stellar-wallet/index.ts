import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import * as StellarSdk from "npm:stellar-sdk@12";
import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  EXPLORER_BASE,
  IS_MAINNET,
} from "../_shared/stellar-network.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENC_KEY = Deno.env.get("STELLAR_ENCRYPTION_KEY")!;
const TREASURY_SEED = Deno.env.get("STELLAR_TREASURY_SEED");

// Funding amount: 1 XLM base reserve + 0.5 XLM per trustline (USDC) + buffer for fees.
const STARTING_BALANCE_XLM = "2.5";

async function getKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(ENC_KEY);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSeed(seed: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(seed))
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv);
  combined.set(ct, iv.length);
  return btoa(String.fromCharCode(...combined));
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

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: wallets, error: wErr } = await admin
      .from("wallets")
      .select("id, currency_code, stellar_address, is_default")
      .eq("user_id", user.id);
    if (wErr) throw wErr;

    const target = wallets?.find((w) => w.currency_code === "USD")
      ?? wallets?.find((w) => w.is_default)
      ?? wallets?.[0];

    if (!target) {
      return new Response(JSON.stringify({ error: "No wallet found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target.stellar_address) {
      return new Response(JSON.stringify({
        stellar_address: target.stellar_address,
        already_existed: true,
        network: IS_MAINNET ? "mainnet" : "testnet",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Generate keypair
    const kp = StellarSdk.Keypair.random();
    const publicKey = kp.publicKey();
    const secret = kp.secret();
    const encrypted = await encryptSeed(secret);

    // Save to DB first so we don't lose the seed if funding fails
    const { error: upWalletErr } = await admin
      .from("wallets")
      .update({ stellar_address: publicKey })
      .eq("id", target.id);
    if (upWalletErr) throw upWalletErr;

    const { error: upProfileErr } = await admin
      .from("profiles")
      .update({ stellar_seed_encrypted: encrypted, stellar_public_key: publicKey })
      .eq("user_id", user.id);
    if (upProfileErr) throw upProfileErr;

    // Fund the new account on-chain via treasury CreateAccount (no Friendbot on mainnet)
    let funded = false;
    let fundError: string | null = null;
    let txHash: string | null = null;

    if (!TREASURY_SEED) {
      fundError = "STELLAR_TREASURY_SEED not configured";
      console.error("Treasury needs more XLM: seed not configured");
    } else {
      try {
        const treasury = StellarSdk.Keypair.fromSecret(TREASURY_SEED);
        const server = new StellarSdk.Horizon.Server(HORIZON_URL);
        const treasuryAccount = await server.loadAccount(treasury.publicKey());
        const fee = await server.fetchBaseFee();

        const tx = new StellarSdk.TransactionBuilder(treasuryAccount, {
          fee: String(fee),
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(StellarSdk.Operation.createAccount({
            destination: publicKey,
            startingBalance: STARTING_BALANCE_XLM,
          }))
          .addMemo(StellarSdk.Memo.text(`new:${user.id.slice(0, 24)}`))
          .setTimeout(120)
          .build();

        tx.sign(treasury);
        const submit = await server.submitTransaction(tx);
        txHash = submit.hash;
        funded = true;
      } catch (err: any) {
        const data = err?.response?.data ?? err?.data;
        fundError = data?.title
          ?? data?.extras?.result_codes?.operations?.join(",")
          ?? err?.message
          ?? String(err);
        console.error("Treasury needs more XLM — CreateAccount failed:", JSON.stringify(data ?? err));
      }
    }

    return new Response(JSON.stringify({
      stellar_address: publicKey,
      funded,
      starting_balance_xlm: STARTING_BALANCE_XLM,
      tx_hash: txHash,
      explorerUrl: txHash ? `${EXPLORER_BASE}/tx/${txHash}` : null,
      fund_error: fundError,
      already_existed: false,
      network: IS_MAINNET ? "mainnet" : "testnet",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("generate-stellar-wallet error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
