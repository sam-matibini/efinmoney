/**
 * One-shot ops probe: small live KES M-Pesa payout via Flutterwave V3.
 * Does NOT touch eFin transfers/ledger — FLW only.
 *
 * POST { confirm: "efm-kes-probe", amount?, phone?, name?, dry_run? }
 */
import { flwV3Fetch } from "../_shared/flw-v3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return Response.json({ error: "POST required" }, { status: 405, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "efm-kes-probe") {
      return Response.json(
        { error: "confirm must be efm-kes-probe" },
        { status: 403, headers: corsHeaders },
      );
    }

    if (!Deno.env.get("FLW_SECRET_KEY")) {
      return Response.json({ error: "FLW_SECRET_KEY missing" }, { status: 503, headers: corsHeaders });
    }

    if (body?.transfer_id || body?.reference) {
      const path = body.transfer_id
        ? `/transfers/${encodeURIComponent(String(body.transfer_id))}`
        : `/transfers?reference=${encodeURIComponent(String(body.reference))}`;
      const st = await flwV3Fetch(path, { method: "GET", timeoutMs: 20_000 });
      return Response.json({
        success: st.ok,
        http_status: st.status,
        flutterwave: st.json,
      }, { headers: corsHeaders });
    }

    const amount = Math.max(1, Math.floor(Number(body.amount) || 10));
    const phone = String(body.phone || "254725293898").replace(/\D/g, "");
    const name = String(body.name || "Mary Mola").trim();
    const dryRun = body.dry_run === true;
    const debitCurrency = String(
      body.debit_currency || Deno.env.get("FLW_MERCHANT_CURRENCY") || "NGN",
    ).toUpperCase();

    const bal = await flwV3Fetch("/balances", { method: "GET", timeoutMs: 15_000 });
    const balances = Array.isArray(bal.json?.data)
      ? bal.json.data.map((r: Record<string, unknown>) => ({
        currency: String(r.currency ?? "").toUpperCase(),
        available: Number(r.available_balance ?? 0),
      }))
      : [];
    const kes = balances.find((b) => b.currency === "KES");
    const debit = balances.find((b) => b.currency === debitCurrency);

    const reference = `efm-kes-probe-${Date.now()}`;
    const payload = {
      account_bank: "MPS",
      account_number: phone,
      amount,
      currency: "KES",
      debit_currency: debitCurrency,
      beneficiary_name: name,
      narration: "eFinMoney KES MoMo probe",
      reference,
      meta: {
        sender: "eFinMoney Probe",
        sender_country: "NG",
        mobile_number: phone,
      },
    };

    if (dryRun) {
      return Response.json({
        success: true,
        dry_run: true,
        balances: { kes: kes?.available ?? 0, debit: debit?.available ?? 0, debit_currency: debitCurrency },
        would_send: payload,
      }, { headers: corsHeaders });
    }

    const tx = await flwV3Fetch("/transfers", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    });

    return Response.json({
      success: tx.ok && (tx.json?.status === "success" || tx.json?.status === "successful"),
      http_status: tx.status,
      balances_before: { kes: kes?.available ?? 0, debit: debit?.available ?? 0, debit_currency: debitCurrency },
      request: { amount, phone, name, debit_currency: debitCurrency, reference },
      flutterwave: tx.json,
    }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "probe failed" },
      { status: 500, headers: corsHeaders },
    );
  }
});
