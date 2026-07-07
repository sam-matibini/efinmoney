// Staff-only probe: test whether Flutterwave accepts CAD/USD/NGN pay-in init on this merchant account.
// Does NOT complete payments — only POST /v3/payments dry-run style (returns link or error).
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import { corsHeaders, json, requireStaffOrCron } from "../_shared/treasury-worker.ts";

type ProbeResult = {
  currency: string;
  ok: boolean;
  payment_link?: string | null;
  message?: string;
  http_status?: number;
};

async function probePaymentInit(currency: string, amount: number): Promise<ProbeResult> {
  const txRef = `efm_probe_${currency.toLowerCase()}_${Date.now()}`;
  const payload = {
    tx_ref: txRef,
    amount: String(amount),
    currency,
    redirect_url: "https://www.efin.money/wallet/topup?flw_probe=1",
    payment_options: "card",
    customer: {
      email: "corridor-probe@efin.money",
      name: "eFin Corridor Probe",
    },
    meta: { type: "corridor_probe", currency },
    customizations: { title: "eFinMoney Corridor Probe" },
  };

  const { ok, status, json: body } = await flwV3Fetch("/payments", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 20_000,
  });

  return {
    currency,
    ok,
    payment_link: body?.data?.link ?? null,
    message: body?.message || body?.error || (ok ? "Payment link created" : `HTTP ${status}`),
    http_status: status,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;

    if (!Deno.env.get("FLW_SECRET_KEY")) {
      return json({
        error: "FLW_SECRET_KEY is not configured on this project",
        hint: "Set FLW_SECRET_KEY in Supabase Edge Function secrets, then re-run this probe.",
      }, 503);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const currencies: string[] = Array.isArray(body?.currencies) && body.currencies.length
      ? body.currencies.map((c: string) => String(c).toUpperCase())
      : ["CAD", "USD", "NGN"];

    const amount = Number(body?.amount) > 0 ? Number(body.amount) : 10;

    const { ok: balOk, status: balStatus, json: balBody } = await flwV3Fetch("/balances", {
      method: "GET",
      timeoutMs: 15_000,
    });

    const balances = balOk && Array.isArray(balBody?.data)
      ? balBody.data.map((row: Record<string, unknown>) => ({
          currency: String(row.currency ?? row.currency_code ?? "").toUpperCase(),
          available: Number(row.available_balance ?? row.balance ?? row.ledger_balance ?? 0),
          pending: Number(row.pending_balance ?? 0),
        }))
      : [];

    const probes = await Promise.all(currencies.map((c) => probePaymentInit(c, amount)));

    const debitCurrency = (Deno.env.get("FLW_MERCHANT_CURRENCY") || "NGN").toUpperCase();

    return json({
      success: true,
      probed_at: new Date().toISOString(),
      flw_merchant_debit_currency: debitCurrency,
      balances_ok: balOk,
      balances_status: balStatus,
      balances: balances,
      balances_error: balOk ? null : (balBody?.message || "Failed to fetch balances"),
      payment_init_probes: probes,
      interpretation: {
        cad_collect_likely: probes.find((p) => p.currency === "CAD")?.ok ?? false,
        usd_collect_likely: probes.find((p) => p.currency === "USD")?.ok ?? false,
        note:
          "ok=true means Flutterwave returned a checkout link for that currency. Complete a small sandbox/live payment separately to confirm settlement and payout debit.",
      },
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Probe failed" },
      500,
    );
  }
});
