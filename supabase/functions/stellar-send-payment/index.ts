import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as StellarSdk from "npm:stellar-sdk@12";
import { z } from "npm:zod@3";
import { HORIZON_URL, NETWORK_PASSPHRASE, EXPLORER_BASE } from "../_shared/stellar-network.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENC_KEY = Deno.env.get("STELLAR_ENCRYPTION_KEY")!;

const BodySchema = z.object({
  destinationAddress: z.string().trim().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address"),
  amount: z.string().trim().regex(/^\d+(\.\d{1,7})?$/, "Invalid amount").refine(
    (v) => Number(v) > 0 && Number(v) < 1_000_000_000,
    "Amount out of range",
  ),
  memo: z.string().max(28).optional(),
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

    // Rate-limit: 10 sends per minute per user
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `stellar_send:${user.id}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { destinationAddress, amount, memo } = parsed.data;

    // Fetch user's encrypted seed + public key
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

    if (destinationAddress === profile.stellar_public_key) {
      return new Response(JSON.stringify({ error: "Cannot send to your own address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const seed = await decryptSeed(profile.stellar_seed_encrypted);
    const keypair = StellarSdk.Keypair.fromSecret(seed);

    const server = new StellarSdk.Horizon.Server(HORIZON);

    // Verify destination exists (or create-account semantics)
    let destinationExists = true;
    try {
      await server.loadAccount(destinationAddress);
    } catch (_e) {
      destinationExists = false;
    }

    const account = await server.loadAccount(keypair.publicKey());
    const fee = await server.fetchBaseFee();

    const txBuilder = new StellarSdk.TransactionBuilder(account, {
      fee: String(fee),
      networkPassphrase: StellarSdk.Networks.TESTNET,
    });

    if (destinationExists) {
      txBuilder.addOperation(
        StellarSdk.Operation.payment({
          destination: destinationAddress,
          asset: StellarSdk.Asset.native(),
          amount,
        }),
      );
    } else {
      // Unfunded destination -> use createAccount (must send >= 1 XLM baseline)
      if (Number(amount) < 1) {
        return new Response(JSON.stringify({
          error: "Destination is unfunded. Minimum 1 XLM required to create the account.",
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      txBuilder.addOperation(
        StellarSdk.Operation.createAccount({
          destination: destinationAddress,
          startingBalance: amount,
        }),
      );
    }

    if (memo) txBuilder.addMemo(StellarSdk.Memo.text(memo));

    const tx = txBuilder.setTimeout(60).build();
    tx.sign(keypair);

    let result: any;
    try {
      result = await server.submitTransaction(tx);
    } catch (err: any) {
      const data = err?.response?.data ?? err?.data;
      const codes = data?.extras?.result_codes;
      console.error("Stellar submit error:", JSON.stringify(data ?? err));
      return new Response(JSON.stringify({
        error: "Stellar transaction failed",
        codes,
        detail: data?.title ?? String(err?.message ?? err),
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const txHash: string = result.hash;

    // Record in ledger (single-leg memo entry against Stellar XLM Holdings)
    try {
      const { data: acct } = await admin
        .from("ledger_accounts")
        .select("id")
        .eq("code", "1260")
        .maybeSingle();

      if (acct?.id) {
        const journalId = crypto.randomUUID();
        await admin.from("ledger_entries").insert({
          journal_id: journalId,
          account_id: acct.id,
          currency_code: "XLM",
          debit_amount: 0,
          credit_amount: Number(amount),
          description: `Stellar payment to ${destinationAddress} (tx ${txHash})`,
          reference_type: "stellar_transfer",
          external_reference: txHash,
          created_by: user.id,
        });
      }
    } catch (ledgerErr) {
      console.error("Ledger insert failed (non-blocking):", ledgerErr);
    }

    return new Response(JSON.stringify({
      success: true,
      hash: txHash,
      ledger: result.ledger,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
      created_account: !destinationExists,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("stellar-send-payment error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
