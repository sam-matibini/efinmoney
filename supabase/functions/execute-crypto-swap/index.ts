// Fiat → Stellar USDC swap. Posts a balanced multi-currency journal AND
// pays USDC on-chain from the platform treasury wallet to the user's
// Stellar account, keeping the off-chain ledger and on-chain balance in sync.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import * as StellarSdk from "npm:stellar-sdk@12";
import { z } from "npm:zod@3";
import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  EXPLORER_BASE,
  IS_MAINNET,
  USDC_ASSET_CODE,
  USDC_ISSUER,
  usdcAsset,
} from "../_shared/stellar-network.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const TREASURY_SEED = Deno.env.get("STELLAR_TREASURY_SEED");

const BodySchema = z.object({
  from_wallet_id: z.string().uuid(),
  from_amount: z.number().positive().max(1_000_000),
  to_currency: z.literal("USDC"),
});

const FEE_BPS = 50; // 0.50% spread

async function validateTreasuryReady(seed: string) {
  const publicKey = StellarSdk.Keypair.fromSecret(seed).publicKey();
  const server = new StellarSdk.Horizon.Server(HORIZON_URL);

  try {
    const account = await server.loadAccount(publicKey);
    const hasUsdcTrustline = account.balances.some((balance: any) => (
      balance.asset_code === USDC_ASSET_CODE && balance.asset_issuer === USDC_ISSUER
    ));

    if (!hasUsdcTrustline) {
      return {
        ok: false as const,
        error: `Treasury Stellar account ${publicKey} is funded on ${IS_MAINNET ? "mainnet" : "testnet"} but missing a USDC trustline. Add the trustline before swapping.`,
      };
    }

    return { ok: true as const };
  } catch (err: any) {
    const data = err?.response?.data ?? err?.data;
    const status = err?.response?.status ?? err?.status;
    const isAccountMissing =
      status === 404 || data?.status === 404 || err?.name === "NotFoundError" ||
      /not.?found/i.test(String(data?.title ?? ""));

    if (isAccountMissing) {
      return {
        ok: false as const,
        error: `Treasury Stellar account ${publicKey} is not funded on ${IS_MAINNET ? "mainnet" : "testnet"}. Fund it (and add a USDC trustline) before swapping.`,
      };
    }

    throw err;
  }
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
      return new Response(JSON.stringify({
        error: "Invalid input", details: parsed.error.flatten().fieldErrors,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { from_wallet_id, from_amount } = parsed.data;

    if (!TREASURY_SEED) {
      return new Response(JSON.stringify({
        error: "Treasury not configured. Set STELLAR_TREASURY_SEED.",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Rate limit
    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `crypto_swap:${user.id}`,
      p_max_requests: 10,
      p_window_seconds: 300,
    });
    if (rl === false) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Verify source wallet
    const { data: fromWallet, error: fwErr } = await admin
      .from("wallets").select("*")
      .eq("id", from_wallet_id).eq("user_id", user.id).maybeSingle();
    if (fwErr) throw fwErr;
    if (!fromWallet) {
      return new Response(JSON.stringify({ error: "Source wallet not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (fromWallet.status !== "active") {
      return new Response(JSON.stringify({ error: `Wallet is ${fromWallet.status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verify user has a Stellar wallet
    const { data: profile, error: pErr } = await admin
      .from("profiles").select("stellar_public_key")
      .eq("user_id", user.id).maybeSingle();
    if (pErr) throw pErr;
    if (!profile?.stellar_public_key) {
      return new Response(JSON.stringify({
        error: "No Stellar wallet on this account. Create one in Wallets first.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Get FX rate fiat → USD (USDC ≈ USD on Stellar)
    const fromCurrency: string = fromWallet.currency_code;
    let effectiveRate: number;
    if (fromCurrency === "USD") {
      effectiveRate = 1;
    } else {
      const { data: rate } = await admin
        .from("fx_rates").select("effective_rate")
        .eq("from_currency", fromCurrency).eq("to_currency", "USD")
        .is("valid_until", null).maybeSingle();
      if (!rate) {
        return new Response(JSON.stringify({
          error: `No exchange rate for ${fromCurrency} → USD`,
        }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      effectiveRate = Number(rate.effective_rate);
    }

    const feeAmount = Number((from_amount * (FEE_BPS / 10000)).toFixed(2));
    const usdcAmount = Number(((from_amount - feeAmount) * effectiveRate).toFixed(7));

    if (usdcAmount <= 0) {
      return new Response(JSON.stringify({ error: "Amount too small after fees" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Check balance via ledger
    const { data: balanceRes } = await admin.rpc("get_wallet_balance", { p_wallet_id: from_wallet_id });
    const balance = Number(balanceRes ?? 0);
    if (from_amount > balance) {
      return new Response(JSON.stringify({
        error: `Insufficient balance: ${balance.toFixed(2)} ${fromCurrency}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const treasuryReady = await validateTreasuryReady(TREASURY_SEED);
    if (!treasuryReady.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: treasuryReady.error,
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5. Resolve ledger accounts
    const { data: fiatLiab } = await admin
      .from("ledger_accounts").select("id").like("code", "21%")
      .eq("currency_code", fromCurrency).limit(1).maybeSingle();
    const { data: usdcAssetAcc } = await admin
      .from("ledger_accounts").select("id").eq("code", "1261").maybeSingle();
    const { data: fxIncome } = await admin
      .from("ledger_accounts").select("id").eq("code", "4100").maybeSingle();

    if (!fiatLiab || !usdcAssetAcc) {
      return new Response(JSON.stringify({ error: "Ledger accounts missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Post journal — DR fiat liability, CR USDC asset, CR FX income.
    const journalId = crypto.randomUUID();
    const entries: any[] = [
      {
        journal_id: journalId, account_id: fiatLiab.id,
        wallet_id: from_wallet_id, currency_code: fromCurrency,
        debit_amount: from_amount, credit_amount: 0,
        description: `Crypto swap: ${fromCurrency} → USDC`,
        reference_type: "crypto_swap", created_by: user.id,
      },
      {
        journal_id: journalId, account_id: usdcAssetAcc.id,
        wallet_id: null, currency_code: "USDC",
        debit_amount: 0, credit_amount: usdcAmount,
        description: `USDC paid to ${profile.stellar_public_key.slice(0, 8)}…`,
        reference_type: "crypto_swap", created_by: user.id,
      },
    ];
    if (fxIncome && feeAmount > 0) {
      entries.push({
        journal_id: journalId, account_id: fxIncome.id,
        wallet_id: null, currency_code: fromCurrency,
        debit_amount: 0, credit_amount: feeAmount,
        description: "Crypto swap spread", reference_type: "crypto_swap",
        created_by: user.id,
      });
    }
    const { error: leErr } = await admin.from("ledger_entries").insert(entries);
    if (leErr) throw new Error(`Ledger insert failed: ${leErr.message}`);

    // 7. Send actual USDC on-chain from treasury → user
    let txHash: string | null = null;
    let txError: string | null = null;
    try {
      const treasury = StellarSdk.Keypair.fromSecret(TREASURY_SEED);
      const server = new StellarSdk.Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(treasury.publicKey());
      const fee = await server.fetchBaseFee();
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: String(fee), networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(StellarSdk.Operation.payment({
          destination: profile.stellar_public_key,
          asset: usdcAsset(),
          amount: usdcAmount.toFixed(7),
        }))
        .addMemo(StellarSdk.Memo.text(`swap:${journalId.slice(0, 20)}`))
        .setTimeout(120)
        .build();
      tx.sign(treasury);
      const submit = await server.submitTransaction(tx);
      txHash = submit.hash;
    } catch (err: any) {
      const data = err?.response?.data ?? err?.data;
      const status = err?.response?.status ?? err?.status;
      const isAccountMissing =
        status === 404 || data?.status === 404 || err?.name === "NotFoundError" ||
        /not.?found/i.test(String(data?.title ?? ""));
      txError = isAccountMissing
        ? `Treasury Stellar account ${StellarSdk.Keypair.fromSecret(TREASURY_SEED).publicKey()} is not funded on ${IS_MAINNET ? "mainnet" : "testnet"}. Fund it (and add a USDC trustline) before swapping.`
        : data?.title ?? data?.extras?.result_codes?.operations?.join(",") ?? err?.message ?? "submit failed";
      console.error("Treasury USDC send failed:", JSON.stringify(data ?? { name: err?.name, message: err?.message }));
      // Reverse the ledger
      const reversal = entries.map((e) => ({
        ...e, journal_id: crypto.randomUUID(),
        debit_amount: e.credit_amount, credit_amount: e.debit_amount,
        description: `Reversal: ${e.description}`,
      }));
      await admin.from("ledger_entries").insert(reversal);
      return new Response(JSON.stringify({
        success: false, error: `On-chain payment failed: ${txError}`,
      }), {
        status: isAccountMissing ? 503 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Record fx_transactions
    await admin.from("fx_transactions").insert({
      user_id: user.id, from_wallet_id, to_wallet_id: null,
      from_currency: fromCurrency, to_currency: "USDC",
      from_amount, to_amount: usdcAmount,
      market_rate: effectiveRate, markup_rate: FEE_BPS / 10000,
      effective_rate: effectiveRate, fee_amount: feeAmount,
      status: "executed", journal_id: journalId,
      executed_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({
      success: true,
      from_amount, to_amount: usdcAmount,
      fee_amount: feeAmount, effective_rate: effectiveRate,
      stellar_tx_hash: txHash,
      explorerUrl: txHash ? `${EXPLORER_BASE}/tx/${txHash}` : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("execute-crypto-swap error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
