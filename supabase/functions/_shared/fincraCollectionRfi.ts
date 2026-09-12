/**
 * Answer Fincra collection RFIs so CAD Interac Autodeposits credit the
 * merchant CAD wallet instead of sitting pending additional information.
 * Docs: https://docs.fincra.com/docs/handling-collection-rfi-request
 */
import { fincraFetch, getFincraConfig } from "./fincra.ts";
import { resolveFincraCadAlias } from "./fincraCad.ts";
import { draftFincraRfiAnswer, extractEfmPaymentCode, type FincraRfiContext } from "./fincraRfiAnswers.ts";

export type FincraRfiRow = {
  id: number;
  request: string;
  response?: unknown;
};

export type FincraRfiSubmitResult = {
  additionalInfoId: number;
  request: string;
  ok: boolean;
  status: number;
  error?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

function collectionRows(json: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (!json) return [];
  const data = json.data as unknown;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const inner = asRecord(data);
  if (Array.isArray(inner?.results)) return inner!.results as Record<string, unknown>[];
  if (Array.isArray(inner?.data)) return inner!.data as Record<string, unknown>[];
  if (Array.isArray(json.results)) return json.results as Record<string, unknown>[];
  const single = asRecord(data);
  if (single && (single._id || single.id)) return [single];
  return [];
}

function rfiRows(json: Record<string, unknown> | undefined): FincraRfiRow[] {
  if (!json) return [];
  const data = json.data as unknown;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.results)
    ? (asRecord(data)!.results as unknown[])
    : Array.isArray(json.results)
    ? json.results as unknown[]
    : [];
  const out: FincraRfiRow[] = [];
  for (const raw of list) {
    const row = asRecord(raw);
    if (!row) continue;
    const id = Number(row.id ?? row.additionalInfoId);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push({
      id,
      request: String(row.request ?? row.question ?? row.description ?? ""),
      response: row.response ?? row.text ?? null,
    });
  }
  return out;
}

function rfiUnanswered(row: FincraRfiRow): boolean {
  if (row.response == null) return true;
  if (typeof row.response === "string") return row.response.trim().length === 0;
  if (Array.isArray(row.response)) return row.response.length === 0;
  const rec = asRecord(row.response);
  if (!rec) return false;
  const text = String(rec.text ?? rec.response ?? "").trim();
  return !text;
}

export function fincraCollectionId(data: Record<string, unknown> | null | undefined): string {
  if (!data) return "";
  const id = data._id ?? data.id ?? data.collectionId ?? data.collection_id;
  return id == null ? "" : String(id).trim();
}

function isCadRow(row: Record<string, unknown>): boolean {
  const ccy = String(row.sourceCurrency || row.destinationCurrency || row.currency || "").toUpperCase();
  return !ccy || ccy === "CAD";
}

function isPendingCollection(row: Record<string, unknown>): boolean {
  const status = String(row.status || "").toLowerCase();
  if (!status) return true;
  return ["pending", "processing", "additional_information_required", "awaiting_additional_info"].includes(status)
    || status.includes("pending")
    || status.includes("additional");
}

function rfiContextFromEnv(base: FincraRfiContext = {}): FincraRfiContext {
  return {
    ...base,
    merchantName: base.merchantName || Deno.env.get("FINCRA_RFI_MERCHANT_NAME")?.trim(),
    termsUrl: base.termsUrl || Deno.env.get("FINCRA_RFI_TERMS_URL")?.trim() || "https://www.efin.money/terms",
    privacyUrl: base.privacyUrl || Deno.env.get("FINCRA_RFI_PRIVACY_URL")?.trim() || "https://www.efin.money/privacy",
  };
}

export async function listFincraCollectionRfis(collectionId: string): Promise<FincraRfiRow[]> {
  const res = await fincraFetch(
    `/collections/${encodeURIComponent(collectionId)}/additional-information`,
    { method: "GET" },
  );
  if (!res.ok) {
    console.warn("fincra RFI list failed", collectionId, res.status, JSON.stringify(res.json).slice(0, 400));
    return [];
  }
  return rfiRows(res.json);
}

export async function answerFincraCollectionRfis(
  collectionId: string,
  ctx: FincraRfiContext = {},
  fallback: Array<{ id?: unknown; request?: unknown }> = [],
): Promise<{ collectionId: string; answered: number; results: FincraRfiSubmitResult[] }> {
  const id = String(collectionId || "").trim();
  if (!id) return { collectionId: id, answered: 0, results: [] };

  let rfis = await listFincraCollectionRfis(id);
  if (!rfis.length && fallback.length) {
    rfis = fallback.map((row) => ({
      id: Number(row.id),
      request: String(row.request || ""),
      response: null,
    })).filter((row) => Number.isFinite(row.id) && row.id > 0);
  }
  const outstanding = rfis.filter(rfiUnanswered);
  const context = rfiContextFromEnv(ctx);
  const results: FincraRfiSubmitResult[] = [];

  for (const rfi of outstanding) {
    const draft = draftFincraRfiAnswer(rfi.request, context);
    const body: Record<string, unknown> = {
      additionalInfoId: rfi.id,
      text: draft.text,
    };
    if (draft.urls?.length) body.urls = draft.urls;
    const res = await fincraFetch(
      `/collections/${encodeURIComponent(id)}/additional-information`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    results.push({
      additionalInfoId: rfi.id,
      request: rfi.request,
      ok: res.ok || res.json?.success === true,
      status: res.status,
      error: res.ok ? undefined : String(res.json?.message || res.json?.error || `HTTP ${res.status}`).slice(0, 300),
    });
    if (!res.ok) {
      console.warn("fincra RFI patch failed", id, rfi.id, res.status, JSON.stringify(res.json).slice(0, 400));
    }
  }

  return {
    collectionId: id,
    answered: results.filter((r) => r.ok).length,
    results,
  };
}

async function listRecentCadCollections(): Promise<Record<string, unknown>[]> {
  const cfg = getFincraConfig();
  const cad = await resolveFincraCadAlias();
  const vaId = cad.virtualAccountId || Deno.env.get("FINCRA_CAD_VIRTUAL_ACCOUNT_ID")?.trim() || "";
  const bizId = cfg.businessId || "";
  const paths: string[] = [];
  if (bizId && vaId) {
    paths.push(`/collections?business=${encodeURIComponent(bizId)}&virtualAccount=${encodeURIComponent(vaId)}`);
  }
  paths.push("/collections?sourceCurrency=CAD");
  paths.push("/collections?destinationCurrency=CAD");
  paths.push("/collections?currency=CAD");

  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const path of paths) {
    const res = await fincraFetch(path, { method: "GET" });
    if (!res.ok) continue;
    for (const row of collectionRows(res.json)) {
      const id = fincraCollectionId(row);
      if (!id || seen.has(id)) continue;
      if (!isCadRow(row)) continue;
      seen.add(id);
      rows.push(row);
    }
    if (rows.length >= 8) break;
  }
  return rows;
}

export function collectionMatchesIntent(
  row: Record<string, unknown>,
  ctx: FincraRfiContext,
): boolean {
  const hay = `${row.description || ""} ${row.narration || ""} ${row.memo || ""} ${row.reference || ""} ${row.sessionId || ""} ${row.customerName || ""}`.toUpperCase();
  const code = String(ctx.paymentCode || "").toUpperCase();
  if (code.length >= 8 && hay.includes(code)) return true;
  const iref = String(ctx.interacReference || "").toUpperCase();
  if (iref.length >= 4 && hay.includes(iref)) return true;
  const amount = Number(row.amountReceived ?? row.destinationAmount ?? row.sourceAmount ?? row.amount);
  if (ctx.amountCad && Number.isFinite(amount) && Math.abs(amount - ctx.amountCad) < 0.02) return true;
  return false;
}

/** Answer outstanding RFIs on pending CAD collections so Fincra can settle Autodeposit. */
export async function reconcilePendingCadCollectionRfis(
  ctx: FincraRfiContext = {},
  opts: { collectionId?: string } = {},
): Promise<{
  scanned: number;
  pending: number;
  answered: number;
  collections: Array<{ collectionId: string; status: string; answered: number }>;
}> {
  const explicit = String(opts.collectionId || "").trim();
  let rows: Record<string, unknown>[] = [];
  if (explicit) {
    const one = await fincraFetch(`/collections/${encodeURIComponent(explicit)}`, { method: "GET" });
    const found = collectionRows(one.json);
    rows = found.length ? found : [{ _id: explicit, status: "pending" }];
  } else {
    rows = await listRecentCadCollections();
  }

  const pending = rows.filter((row) => isPendingCollection(row) || collectionMatchesIntent(row, ctx));
  const summary: Array<{ collectionId: string; status: string; answered: number }> = [];
  let answered = 0;

  for (const row of pending) {
    const id = fincraCollectionId(row);
    if (!id) continue;
    const matchCtx: FincraRfiContext = {
      ...ctx,
      amountCad: ctx.amountCad ?? Number(row.amountReceived ?? row.destinationAmount ?? row.sourceAmount ?? row.amount) || undefined,
      senderName: ctx.senderName || String(row.customerName || row.senderAccountName || "") || undefined,
      paymentCode: ctx.paymentCode,
      interacReference: ctx.interacReference || String(row.sessionId || "") || undefined,
    };
    const result = await answerFincraCollectionRfis(id, matchCtx);
    answered += result.answered;
    summary.push({
      collectionId: id,
      status: String(row.status || ""),
      answered: result.answered,
    });
  }

  return {
    scanned: rows.length,
    pending: pending.length,
    answered,
    collections: summary,
  };
}
