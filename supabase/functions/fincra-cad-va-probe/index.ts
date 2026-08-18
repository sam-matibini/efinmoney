/**
 * Staff-only: inspect Fincra CAD virtual accounts and request one via API.
 * Dashboard "Setup A Bank Account" does not list CAD yet — Fincra asked us to
 * POST /profile/virtual-accounts/requests with currency=CAD instead.
 *
 * GET  body {}           → list CAD/GBP/EUR/USD VAs + pending requests
 * POST body { action: "request" } → create the CAD collection account
 */
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";
import { corsHeaders, json, requireStaffOrCron } from "../_shared/treasury-worker.ts";

function clip(body: unknown, max = 1800) {
  try {
    const s = JSON.stringify(body ?? null);
    if (s.length <= max) return body;
    return { truncated: true, preview: s.slice(0, max) };
  } catch {
    return { error: "unserializable" };
  }
}

function asRows(json: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const data = json?.data as Record<string, unknown> | unknown[] | undefined;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (Array.isArray((data as Record<string, unknown> | undefined)?.results)) {
    return (data as Record<string, unknown>).results as Record<string, unknown>[];
  }
  if (Array.isArray(json?.results)) return json!.results as Record<string, unknown>[];
  return [];
}

function pickInteracEmail(row: Record<string, unknown>): string {
  const info = (row.accountInformation ?? row.account_information) as Record<string, unknown> | null;
  const other = (info?.otherInfo ?? info?.other_info) as Record<string, unknown> | null;
  const candidates = [
    other?.interacEmail,
    other?.interac_email,
    info?.interacEmail,
    info?.email,
    row.interacEmail,
    row.accountNumber,
    info?.accountNumber,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s.includes("@") || /^\d{6,}$/.test(s)) return s;
  }
  return "";
}

function summarizeVa(row: Record<string, unknown>) {
  const info = (row.accountInformation ?? row.account_information) as Record<string, unknown> | null;
  return {
    id: String(row._id ?? row.id ?? ""),
    currency: String(row.currency ?? "").toUpperCase(),
    status: String(row.status ?? ""),
    isActive: row.isActive ?? row.is_active ?? null,
    accountName: info?.accountName ?? info?.account_name ?? row.accountName ?? null,
    bankName: info?.bankName ?? info?.bank_name ?? null,
    accountNumber: info?.accountNumber ?? info?.account_number ?? null,
    interacEmail: pickInteracEmail(row) || null,
  };
}

async function listCurrency(currency: string) {
  const res = await fincraFetch(`/profile/virtual-accounts/?currency=${encodeURIComponent(currency)}`, {
    method: "GET",
  });
  return {
    currency: currency.toUpperCase(),
    ok: res.ok,
    http_status: res.status,
    message: String(res.json?.message || (res.ok ? "ok" : `HTTP ${res.status}`)),
    count: asRows(res.json).length,
    accounts: asRows(res.json).map(summarizeVa),
    raw: clip(res.json, 900),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;
    if (!Deno.env.get("FINCRA_SECRET_KEY")) {
      return json({ error: "FINCRA_SECRET_KEY is not configured" }, 503);
    }

    const body = await req.json().catch(() => ({})) as { action?: string };
    const action = String(body.action || "probe").toLowerCase();
    const cfg = getFincraConfig();

    const [cad, gbp, eur, usd, all, requests, me] = await Promise.all([
      listCurrency("cad"),
      listCurrency("gbp"),
      listCurrency("eur"),
      listCurrency("usd"),
      fincraFetch("/profile/virtual-accounts/", { method: "GET" }),
      fincraFetch("/profile/virtual-accounts/requests", { method: "GET" }),
      fincraFetch("/profile/business/me", { method: "GET" }),
    ]);

    const cadReady = cad.accounts.find((a) => {
      const st = a.status.toLowerCase();
      return a.interacEmail && (!st || ["approved", "active", "issued"].includes(st));
    }) || null;

    const result: Record<string, unknown> = {
      ok: true,
      mode: cfg.mode,
      can_use_api: true,
      endpoint: "POST /profile/virtual-accounts/requests",
      docs: "https://docs.fincra.com/docs/cad-collections-interac-e-transfer",
      business: clip((me.json as Record<string, unknown>)?.data ?? me.json, 600),
      cad,
      siblings: { gbp, eur, usd },
      all_virtual_accounts: {
        ok: all.ok,
        http_status: all.status,
        message: String(all.json?.message || (all.ok ? "ok" : `HTTP ${all.status}`)),
        count: asRows(all.json).length,
        accounts: asRows(all.json).map(summarizeVa),
      },
      pending_requests: {
        ok: requests.ok,
        http_status: requests.status,
        message: String(requests.json?.message || (requests.ok ? "ok" : `HTTP ${requests.status}`)),
        data: clip(requests.json, 1200),
      },
      cad_ready: Boolean(cadReady),
      interac_alias: cadReady?.interacEmail || Deno.env.get("FINCRA_CAD_INTERAC_ALIAS") || null,
      reply_to_fincra: cadReady
        ? `Yes — CAD is already live via API. Interac alias: ${cadReady.interacEmail}`
        : "Yes — we can request CAD via API (POST /profile/virtual-accounts/requests, currency=CAD) while it is added to the dashboard.",
    };

    if (action === "request") {
      if (cadReady) {
        result.request = { skipped: true, reason: "CAD virtual account already exists", account: cadReady };
        return json(result);
      }

      const merchantReference = `efm-cad-${Date.now()}`;
      const payload = {
        currency: "CAD",
        accountType: "corporate",
        purpose: "third_party",
        merchantReference,
        note: "eFinMoney CAD Interac collection account — requested via API while CAD is added to the merchant dashboard.",
      };
      const created = await fincraFetch("/profile/virtual-accounts/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      result.request = {
        attempted: true,
        payload,
        ok: created.ok,
        http_status: created.status,
        message: String(created.json?.message || created.json?.error || (created.ok ? "requested" : `HTTP ${created.status}`)),
        data: clip(created.json),
      };
      if (created.ok) {
        const createdRows = asRows(created.json);
        const createdRow = createdRows[0] || (created.json?.data as Record<string, unknown> | undefined);
        const alias = createdRow && typeof createdRow === "object" ? pickInteracEmail(createdRow) : "";
        result.cad_ready = Boolean(alias) || result.cad_ready;
        if (alias) result.interac_alias = alias;
        result.reply_to_fincra = alias
          ? `Yes — CAD requested via API and issued. Interac alias: ${alias}`
          : "Yes — CAD requested via API. Awaiting Fincra approval / Interac alias.";
      } else {
        result.reply_to_fincra =
          `Yes — we can use the API. POST /profile/virtual-accounts/requests returned HTTP ${created.status}: ${String(created.json?.message || created.json?.error || "see payload")}. Please enable CAD on the merchant or confirm the required KYB fields.`;
      }
    }

    return json(result);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Fincra CAD VA probe failed" }, 500);
  }
});
