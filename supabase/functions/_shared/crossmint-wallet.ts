// Shared helper: get-or-create a Crossmint Smart Wallet for a user on a given chain.
// Uses Crossmint server-side API key. Stores result in public.crossmint_wallets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type CrossmintEnv = "staging" | "production";

export function crossmintBase(env: CrossmintEnv) {
  return env === "production"
    ? "https://www.crossmint.com/api"
    : "https://staging.crossmint.com/api";
}

export interface CrossmintWalletRow {
  user_id: string;
  chain: string;
  address: string;
  locator: string;
  env: CrossmintEnv;
}

export async function getOrCreateCrossmintWallet(opts: {
  admin: ReturnType<typeof createClient>;
  apiKey: string;
  env: CrossmintEnv;
  userId: string;
  userEmail?: string;
  chain: string; // "stellar" | "base" | "solana" | "polygon" ...
}): Promise<CrossmintWalletRow> {
  const { admin, apiKey, env, userId, userEmail, chain } = opts;

  // 1. Check cache
  const { data: existing } = await admin
    .from("crossmint_wallets")
    .select("user_id,chain,address,locator,env")
    .eq("user_id", userId)
    .eq("chain", chain)
    .eq("env", env)
    .maybeSingle();
  if (existing) return existing as CrossmintWalletRow;

  // 2. Create on Crossmint. We bind the wallet to the user via linkedUser=email:...
  // so the same user always resolves to the same wallet.
  //
  // Signer fallback chain: the project may not have all signer types enabled.
  // CROSSMINT_SIGNER_TYPE env var can override the preferred type. Otherwise
  // we try api-key first (best for server-driven sweeps), then fall back to
  // email (delegated signer tied to the linkedUser), then passkey.
  const base = crossmintBase(env);
  const preferred = (Deno.env.get("CROSSMINT_SIGNER_TYPE") ?? "").toLowerCase();
  const signerChain: Array<Record<string, unknown>> = [];
  const pushUnique = (s: Record<string, unknown>) => {
    if (!signerChain.find((x) => x.type === s.type)) signerChain.push(s);
  };
  if (preferred === "api-key") pushUnique({ type: "api-key" });
  if (preferred === "email" && userEmail) pushUnique({ type: "email", email: userEmail });
  if (preferred === "passkey") pushUnique({ type: "passkey" });
  // Default fallback order
  pushUnique({ type: "api-key" });
  if (userEmail) pushUnique({ type: "email", email: userEmail });
  pushUnique({ type: "passkey" });

  let data: any = null;
  let lastErr = "";
  let okResp = false;
  for (const adminSigner of signerChain) {
    const body: Record<string, unknown> = {
      type: "smart",
      chainType: chain === "stellar" ? "stellar" : "evm",
      chain,
      config: { adminSigner },
    };
    if (userEmail) body.linkedUser = `email:${userEmail}`;

    const resp = await fetch(`${base}/2025-06-09/wallets`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      okResp = true;
      console.log(`Crossmint wallet created with signer=${adminSigner.type}`);
      break;
    }
    lastErr = `signer=${adminSigner.type} status=${resp.status} body=${JSON.stringify(data)}`;
    console.warn(`Crossmint wallet create failed, trying next signer. ${lastErr}`);
    // Only fall through on "not enabled" style errors; otherwise stop early.
    const msg = JSON.stringify(data).toLowerCase();
    if (!msg.includes("not enabled") && !msg.includes("not allowed") && !msg.includes("disabled") && resp.status !== 400 && resp.status !== 403) {
      break;
    }
  }
  if (!okResp) {
    throw new Error(`Crossmint wallet create failed across all signers. Last: ${lastErr}`);
  }

  const address: string = data?.address ?? data?.wallet?.address ?? "";
  const locator: string = data?.locator ?? `${chain}:${address}`;
  if (!address) {
    throw new Error(`Crossmint wallet response missing address: ${JSON.stringify(data)}`);
  }

  // 3. Persist
  await admin.from("crossmint_wallets").upsert(
    {
      user_id: userId,
      chain,
      address,
      locator,
      env,
      raw: data,
    },
    { onConflict: "user_id,chain,env" },
  );

  return { user_id: userId, chain, address, locator, env };
}

// Programmatically transfer a token from a Crossmint Smart Wallet to an
// external address (e.g. Yellow Card Stellar deposit). Returns the on-chain tx hash.
export async function crossmintWalletTransfer(opts: {
  apiKey: string;
  env: CrossmintEnv;
  walletLocator: string; // e.g. "stellar:G..." or wallet id
  tokenLocator: string; // e.g. "stellar:USDC:GA5Z..."
  recipient: string; // destination address (chain-native)
  amount: string; // human-readable amount, e.g. "10.00"
}): Promise<{ txHash: string | null; raw: unknown }> {
  const base = crossmintBase(opts.env);
  const url =
    `${base}/2025-06-09/wallets/${encodeURIComponent(opts.walletLocator)}` +
    `/tokens/${encodeURIComponent(opts.tokenLocator)}/transfers`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": opts.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: opts.recipient,
      amount: opts.amount,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `Crossmint wallet transfer failed (${resp.status}): ${JSON.stringify(data)}`,
    );
  }
  const txHash: string | null =
    data?.onChain?.txId ??
    data?.onChain?.transactionHash ??
    data?.txId ??
    data?.transactionHash ??
    null;
  return { txHash, raw: data };
}
