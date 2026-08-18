/**
 * Staff-only: hit Flutterwave for USD/GHS virtual accounts + USDC wallet/fee APIs.
 * Does not convert funds or create permanent VAs.
 */
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import { corsHeaders, json, requireStaffOrCron } from "../_shared/treasury-worker.ts";

function clip(body: unknown) {
  try {
    const s = JSON.stringify(body ?? null);
    if (s.length <= 1600) return body;
    return { truncated: true, preview: s.slice(0, 1600) };
  } catch {
    return { error: "unserializable" };
  }
}

async function hit(path: string, opts: RequestInit & { timeoutMs?: number } = {}) {
  const { ok, status, json: body } = await flwV3Fetch(path, { timeoutMs: 20_000, ...opts });
  return {
    path,
    method: String(opts.method || "GET"),
    ok,
    http_status: status,
    message: body?.message || body?.error || (ok ? "ok" : `HTTP ${status}`),
    data: clip(body?.data ?? body),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;
    if (!Deno.env.get("FLW_SECRET_KEY")) {
      return json({ error: "FLW_SECRET_KEY is not configured" }, 503);
    }

    const balances = await hit("/balances");
    const balRows = Array.isArray(balances.data) ? balances.data : [];
    const stable = (balRows as Array<Record<string, unknown>>).filter((r) =>
      ["USDC", "USDT", "RLUSD", "USD"].includes(String(r.currency || "").toUpperCase()),
    );

    const usdcFee = await hit("/transfers/fee?amount=1&currency=USDC&type=crypto");
    const usdtFee = await hit("/transfers/fee?amount=1&currency=USDT&type=crypto");

    const walletGets = await Promise.all([
      hit("/wallets"),
      hit("/crypto/wallets"),
      hit("/crypto/addresses"),
      hit("/wallet-addresses"),
      hit("/balances/USDC"),
      hit("/virtual-account-numbers"),
      hit("/payout-subaccounts?limit=5"),
    ]);

    const txRef = `efm_va_probe_${Date.now()}`;
    const usdVa = await hit("/virtual-account-numbers", {
      method: "POST",
      body: JSON.stringify({
        email: "corridor-probe@efin.money",
        tx_ref: `${txRef}_usd`,
        is_permanent: false,
        amount: 1,
        currency: "USD",
        firstname: "eFin",
        lastname: "Probe",
        narration: "eFinMoney USD VA probe",
      }),
    });
    const ghsVa = await hit("/virtual-account-numbers", {
      method: "POST",
      body: JSON.stringify({
        email: "corridor-probe@efin.money",
        tx_ref: `${txRef}_ghs`,
        is_permanent: false,
        amount: 1,
        currency: "GHS",
        firstname: "eFin",
        lastname: "Probe",
        narration: "eFinMoney GHS VA probe",
      }),
    });
    const ngnVa = await hit("/virtual-account-numbers", {
      method: "POST",
      body: JSON.stringify({
        email: "corridor-probe@efin.money",
        tx_ref: `${txRef}_ngn`,
        is_permanent: false,
        amount: 100,
        currency: "NGN",
        firstname: "eFin",
        lastname: "Probe",
        narration: "eFinMoney NGN VA probe",
      }),
    });

    let usdPsaVa: unknown = null;
    const psa = walletGets.find((r) => r.path.startsWith("/payout-subaccounts"));
    const firstRef =
      (psa?.data as { payout_subaccounts?: Array<{ account_reference?: string }> })
        ?.payout_subaccounts?.[0]?.account_reference
      || (Array.isArray(psa?.data) ? (psa?.data as Array<{ account_reference?: string }>)[0]?.account_reference : null);
    if (firstRef) {
      usdPsaVa = await hit(
        `/payout-subaccounts/${encodeURIComponent(firstRef)}/static-account?currency=USD`,
      );
    }

    const usdVaOk = usdVa.ok;
    const usdcBalanceOk = balances.ok && stable.some((r) => String(r.currency).toUpperCase() === "USDC");

    return json({
      success: true,
      probed_at: new Date().toISOString(),
      interpretation: {
        usd_virtual_account: usdVaOk
          ? "Flutterwave accepted a USD virtual-account create."
          : `USD VA not available via this endpoint: ${usdVa.message}`,
        usdc: usdcBalanceOk
          ? "USDC wallet exists on the merchant (balance API). Receive address is usually dashboard-only — see wallet_gets."
          : "USDC wallet not visible or balances call failed.",
        note: "No funds were converted. VA creates are temporary (is_permanent=false).",
      },
      stablecoin_balances: stable,
      usdc_transfer_fee: usdcFee,
      usdt_transfer_fee: usdtFee,
      virtual_accounts: { usd: usdVa, ghs: ghsVa, ngn: ngnVa, payout_subaccount_usd: usdPsaVa },
      wallet_gets: walletGets,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Probe failed" }, 500);
  }
});
