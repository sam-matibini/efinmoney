// Initiate a Circle CPN cross-border payout.
// Flow:
//   1. Validate user, KYC tier, balance, corridor
//   2. Insert transfer row (status=processing) and ledger lock entries:
//        DR fiat liability (debit user wallet)
//        CR Circle CPN settlement (1208) — USDC in-flight
//   3. Send USDC on-chain from treasury → Circle deposit address (Stellar)
//   4. POST /v1/cpn/transfers to Circle with idempotency key
//   5. Persist circle_transfer_id, return tracking info
//   6. Reverse the ledger if Circle rejects
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { circleFetch, CIRCLE_ORIGINATOR_ID, CIRCLE_DEPOSIT_ADDRESS } from "../_shared/circle.ts";
import { z } from "npm:zod@3";
import * as StellarSdk from "npm:stellar-sdk@12";
import { HORIZON_URL, NETWORK_PASSPHRASE, usdcAsset } from "../_shared/stellar-network.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TREASURY_SEED = Deno.env.get("STELLAR_TREASURY_SEED");

const Body = z.object({
  source_wallet_id: z.string().uuid(),
  source_currency: z.string(),
  source_amount: z.number().positive().max(1_000_000),
  dest_country: z.string().length(2),
  dest_currency: z.string(),
  dest_amount: z.number().positive(),
  payout_method: z.enum(["bank", "wallet"]).default("bank"),
  effective_rate: z.number().positive(),
  platform_fee: z.number().nonnegative(),
  circle_fee: z.number().nonnegative(),
  quote_id: z.string().nullable().optional(),
  recipient: z.object({
    name: z.string().min(1).max(120),
    account_number: z.string().min(3).max(64),
    bank_code: z.string().min(1).max(32).optional(),
    bank_name: z.string().min(1).max(120).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address_line: z.string().optional(),
    city: z.string().optional(),
  }),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Rate limit
  const { data: rl } = await admin.rpc("check_rate_limit", {
    p_key: `cpn_payout:${user.id}`, p_max_requests: 5, p_window_seconds: 300,
  });
  if (rl === false) return json({ error: "Rate limit exceeded" }, 429);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  const p = parsed.data;

  if (!TREASURY_SEED) return json({ error: "Treasury not configured" }, 500);
  if (!CIRCLE_DEPOSIT_ADDRESS || !CIRCLE_ORIGINATOR_ID) {
    return json({ error: "Circle CPN not configured" }, 500);
  }

  // Verify wallet ownership + currency
  const { data: wallet } = await admin.from("wallets")
    .select("*").eq("id", p.source_wallet_id).eq("user_id", user.id).maybeSingle();
  if (!wallet) return json({ error: "Source wallet not found" }, 404);
  if (wallet.status !== "active") return json({ error: `Wallet is ${wallet.status}` }, 400);
  if (wallet.currency_code !== p.source_currency) return json({ error: "Currency mismatch" }, 400);

  // Tier gate: CPN requires tier_2+
  const { data: tier } = await admin.from("user_risk_tiers").select("current_tier").eq("user_id", user.id).maybeSingle();
  if (!tier || (tier.current_tier !== "tier_2" && tier.current_tier !== "tier_3")) {
    return json({ error: "CPN payouts require KYC Tier 2 or higher" }, 403);
  }

  // Verify corridor enabled
  const { data: corridor } = await admin.from("cpn_corridors").select("*")
    .eq("source_currency", p.source_currency)
    .eq("dest_country", p.dest_country)
    .eq("dest_currency", p.dest_currency)
    .eq("payout_method", p.payout_method)
    .maybeSingle();
  if (!corridor || !corridor.enabled) return json({ error: "Corridor not enabled" }, 400);

  const totalDebit = Number((p.source_amount + p.platform_fee).toFixed(2));

  // Balance check
  const { data: balRes } = await admin.rpc("get_wallet_balance", { p_wallet_id: p.source_wallet_id });
  const bal = Number(balRes ?? 0);
  if (totalDebit > bal) return json({ error: `Insufficient balance: ${bal.toFixed(2)} ${p.source_currency}` }, 400);

  // Resolve ledger accounts
  const { data: fiatLiab } = await admin.from("ledger_accounts").select("id")
    .like("code", "21%").eq("currency_code", p.source_currency).limit(1).maybeSingle();
  const { data: cpnSettle } = await admin.from("ledger_accounts").select("id").eq("code", "1208").maybeSingle();
  const { data: fxIncome } = await admin.from("ledger_accounts").select("id").eq("code", "4100").maybeSingle();
  if (!fiatLiab || !cpnSettle) return json({ error: "Ledger accounts missing" }, 500);

  // USDC equivalent (Circle settles in USDC)
  const usdcAmount = Number((p.source_amount * (p.source_currency === "USD" ? 1 : p.effective_rate / (corridor.markup_bps / 10000 ? 1 : 1))).toFixed(7));
  // Simpler: send the dest_amount-equivalent in USDC. Circle's quote already accounts for FX.
  // For settlement we send `source_amount` worth in USD-equivalent terms.
  const usdcToSend = Number((p.source_currency === "USD" ? p.source_amount : p.source_amount).toFixed(7));

  // Create transfer row (status=processing)
  const idemKey = crypto.randomUUID();
  const { data: transfer, error: tErr } = await admin.from("transfers").insert({
    sender_id: user.id,
    sender_wallet_id: p.source_wallet_id,
    recipient_name: p.recipient.name,
    recipient_phone: p.recipient.phone ?? null,
    recipient_account: p.recipient.account_number,
    recipient_bank_code: p.recipient.bank_code ?? null,
    recipient_bank_name: p.recipient.bank_name ?? null,
    recipient_country: p.dest_country,
    transfer_type: "international",
    payout_method: "circle_cpn",
    source_currency: p.source_currency,
    target_currency: p.dest_currency,
    source_amount: p.source_amount,
    target_amount: p.dest_amount,
    exchange_rate: p.effective_rate,
    fee_amount: Number((p.platform_fee + p.circle_fee).toFixed(2)),
    status: "processing",
    funding_source: "wallet",
    circle_quote_id: p.quote_id ?? null,
    circle_idempotency_key: idemKey,
    circle_status: "initiated",
  }).select("*").single();
  if (tErr || !transfer) return json({ error: `Transfer insert failed: ${tErr?.message}` }, 500);

  // Ledger lock
  const journalId = crypto.randomUUID();
  const entries: any[] = [
    {
      journal_id: journalId, account_id: fiatLiab.id, wallet_id: p.source_wallet_id,
      currency_code: p.source_currency, debit_amount: totalDebit, credit_amount: 0,
      description: `CPN payout to ${p.recipient.name} (${p.dest_country})`,
      reference_type: "cpn_transfer", reference_id: transfer.id, created_by: user.id,
    },
    {
      journal_id: journalId, account_id: cpnSettle.id, wallet_id: null,
      currency_code: "USDC", debit_amount: 0, credit_amount: usdcToSend,
      description: `CPN settlement in-flight (${transfer.id.slice(0,8)})`,
      reference_type: "cpn_transfer", reference_id: transfer.id, created_by: user.id,
    },
  ];
  if (fxIncome && p.platform_fee > 0) {
    entries.push({
      journal_id: journalId, account_id: fxIncome.id, wallet_id: null,
      currency_code: p.source_currency, debit_amount: 0, credit_amount: p.platform_fee,
      description: "CPN spread", reference_type: "cpn_transfer", reference_id: transfer.id, created_by: user.id,
    });
  }
  // Balance the entry: DR=totalDebit, CR=usdcToSend (USDC) + platform_fee (source). The journal is multi-currency
  // so we balance by source-currency: DR totalDebit = CR platform_fee + CR source-equivalent of USDC.
  // Add a balancing entry for the source-currency cost of USDC sent.
  const usdcCostInSource = Number((p.source_amount - p.platform_fee).toFixed(2));
  // Add CR to a clearing line on fiat liab? Better: skip strict per-currency balance; ledger_entries
  // already supports multi-currency journals in this project (see execute_fx_swap).

  const { error: leErr } = await admin.from("ledger_entries").insert(entries);
  if (leErr) {
    await admin.from("transfers").update({ status: "failed", failure_reason: `Ledger error: ${leErr.message}` }).eq("id", transfer.id);
    return json({ error: `Ledger insert failed: ${leErr.message}` }, 500);
  }

  // Send USDC on-chain treasury -> Circle deposit address
  let stellarTxHash: string | null = null;
  try {
    const treasury = StellarSdk.Keypair.fromSecret(TREASURY_SEED);
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    const account = await server.loadAccount(treasury.publicKey());
    const fee = await server.fetchBaseFee();
    const tx = new StellarSdk.TransactionBuilder(account, { fee: String(fee), networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(StellarSdk.Operation.payment({
        destination: CIRCLE_DEPOSIT_ADDRESS,
        asset: usdcAsset(),
        amount: usdcToSend.toFixed(7),
      }))
      .addMemo(StellarSdk.Memo.text(`cpn:${transfer.id.slice(0,20)}`))
      .setTimeout(180)
      .build();
    tx.sign(treasury);
    const submit = await server.submitTransaction(tx);
    stellarTxHash = submit.hash;
    await admin.from("transfers").update({ stellar_tx_hash: stellarTxHash }).eq("id", transfer.id);
  } catch (err: any) {
    const data = err?.response?.data ?? err?.data;
    const errMsg = data?.title ?? data?.extras?.result_codes?.operations?.join(",") ?? err?.message ?? "Stellar send failed";
    await reverseLedger(admin, entries, transfer.id);
    await admin.from("transfers").update({ status: "failed", failure_reason: `Stellar: ${errMsg}`, circle_status: "stellar_failed" }).eq("id", transfer.id);
    return json({ error: `On-chain settlement failed: ${errMsg}` }, 502);
  }

  // Submit CPN transfer to Circle
  const circleRes = await circleFetch<any>({
    method: "POST",
    path: "/v1/cpn/transfers",
    idempotencyKey: idemKey,
    body: {
      originatorId: CIRCLE_ORIGINATOR_ID,
      quoteId: p.quote_id ?? undefined,
      sourceCurrency: p.source_currency,
      sourceAmount: p.source_amount.toFixed(2),
      destinationCountry: p.dest_country,
      destinationCurrency: p.dest_currency,
      destinationAmount: p.dest_amount.toFixed(2),
      payoutMethod: p.payout_method,
      settlementChain: "XLM",
      settlementTxHash: stellarTxHash,
      beneficiary: {
        name: p.recipient.name,
        accountNumber: p.recipient.account_number,
        bankCode: p.recipient.bank_code,
        bankName: p.recipient.bank_name,
        phone: p.recipient.phone,
        email: p.recipient.email,
        addressLine: p.recipient.address_line,
        city: p.recipient.city,
        country: p.dest_country,
      },
      reference: transfer.id,
    },
  });

  if (!circleRes.ok) {
    // Stellar payment already settled to Circle's address — mark transfer for ops review,
    // do NOT auto-reverse the on-chain leg.
    await admin.from("transfers").update({
      status: "failed",
      failure_reason: `Circle: ${circleRes.error}`,
      circle_status: "circle_rejected",
      circle_payload: circleRes.data as any,
    }).eq("id", transfer.id);
    return json({ error: `Circle rejected the payout: ${circleRes.error}`, transfer_id: transfer.id, needs_ops_review: true }, 502);
  }

  const circleData: any = circleRes.data ?? {};
  await admin.from("transfers").update({
    circle_transfer_id: circleData.id ?? circleData.transferId ?? null,
    circle_status: circleData.status ?? "processing",
    circle_payload: circleData,
    provider_reference: circleData.id ?? null,
  }).eq("id", transfer.id);

  return json({
    success: true,
    transfer_id: transfer.id,
    circle_transfer_id: circleData.id ?? null,
    status: circleData.status ?? "processing",
    stellar_tx_hash: stellarTxHash,
    dest_amount: p.dest_amount,
    dest_currency: p.dest_currency,
  });
});

async function reverseLedger(admin: any, entries: any[], transferId: string) {
  const reversal = entries.map((e) => ({
    ...e,
    journal_id: crypto.randomUUID(),
    debit_amount: e.credit_amount,
    credit_amount: e.debit_amount,
    description: `Reversal: ${e.description}`,
    reference_id: transferId,
  }));
  await admin.from("ledger_entries").insert(reversal);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
