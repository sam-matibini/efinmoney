/**
 * Nomba Nigeria bank rails via lenhub (mtn.lenhub.net).
 *
 * GET  /api/efin/nigeria/bankcode
 * GET  /api/efin/nigeria/account/lookup
 * GET  /api/efin/exchange/
 * POST /api/efin/nigeria/transfer
 * POST /api/efin/nigeria/transfer/conversion
 */

import { getNombaPayConfig } from "./nomba-pay.ts";

const DEFAULT_BANKCODE_PATH = "/api/efin/nigeria/bankcode";
const DEFAULT_LOOKUP_PATH = "/api/efin/nigeria/account/lookup";
const DEFAULT_EXCHANGE_PATH = "/api/efin/exchange/";
const DEFAULT_TRANSFER_PATH = "/api/efin/nigeria/transfer";
const DEFAULT_CONVERSION_PATH = "/api/efin/nigeria/transfer/conversion";

export interface NombaNigeriaConfig {
  baseUrl: string;
  bankcodeUrl: string;
  lookupUrl: string;
  exchangeUrl: string;
  transferUrl: string;
  conversionUrl: string;
  merchantUser: string;
}

export interface NombaBank {
  code: string;
  name: string;
  nipCode: string | null;
  logo: string | null;
}

export interface NombaApiResult {
  ok: boolean;
  httpStatus: number;
  code: string | null;
  message: string;
  json: Record<string, unknown>;
  raw: string;
}

export interface NombaExchangeRate {
  pair: string;
  bidRate: string;
  askRate: string;
  midRate: string;
  midRateNumeric: number | null;
}

export interface NombaConversionResult extends NombaApiResult {
  convertedAmount: number | null;
  fromCurrency: string;
  toCurrency: string;
}

export interface NombaTransferResult extends NombaApiResult {
  providerRef: string | null;
}

function joinPath(host: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${host}${cleanPath}`;
}

export function getNombaNigeriaConfig(): NombaNigeriaConfig {
  const pay = getNombaPayConfig();
  const baseUrl = pay.baseUrl;
  return {
    baseUrl,
    bankcodeUrl: joinPath(baseUrl, Deno.env.get("NOMBA_NIGERIA_BANKCODE_PATH")?.trim() || DEFAULT_BANKCODE_PATH),
    lookupUrl: joinPath(baseUrl, Deno.env.get("NOMBA_NIGERIA_LOOKUP_PATH")?.trim() || DEFAULT_LOOKUP_PATH),
    exchangeUrl: joinPath(baseUrl, Deno.env.get("NOMBA_EXCHANGE_PATH")?.trim() || DEFAULT_EXCHANGE_PATH),
    transferUrl: joinPath(baseUrl, Deno.env.get("NOMBA_NIGERIA_TRANSFER_PATH")?.trim() || DEFAULT_TRANSFER_PATH),
    conversionUrl: joinPath(baseUrl, Deno.env.get("NOMBA_NIGERIA_CONVERSION_PATH")?.trim() || DEFAULT_CONVERSION_PATH),
    merchantUser: pay.merchantUser,
  };
}

export function isNombaNigeriaConfigured(): boolean {
  // Bank/FX/payout paths were /api/efin on mtn.lenhub.net — retired.
  return false;
}

function parseEnvelope(httpStatus: number, json: Record<string, unknown>, raw: string): NombaApiResult {
  const outer = (json.data ?? json) as Record<string, unknown>;
  const code = String(outer?.code ?? json.code ?? "").trim() || null;
  const message = String(outer?.description ?? outer?.message ?? json.message ?? "").trim();
  const statusFlag = outer?.status ?? json.status;
  const ok = httpStatus >= 200 && httpStatus < 300 && (code === "00" || code === "200" || statusFlag === true);
  return { ok, httpStatus, code, message, json, raw };
}

function parseMidRateNumeric(midRate: string): number | null {
  const cleaned = midRate.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function nombaFetch(url: string, _init?: RequestInit, _timeoutMs = 45_000): Promise<NombaApiResult> {
  return {
    ok: false,
    httpStatus: 410,
    code: "410",
    message: "Lenhub /api/efin Nigeria rails are retired (including /api/efin/exchange/).",
    json: { error: "retired", url },
    raw: "retired",
  };
}

export function normalizeNombaBanks(json: Record<string, unknown>): NombaBank[] {
  const root = json as Record<string, unknown>;
  const data = Array.isArray(root.data) ? root.data : Array.isArray((root.data as Record<string, unknown>)?.data)
    ? (root.data as Record<string, unknown>).data
    : [];
  return (data as Record<string, unknown>[])
    .map((b) => ({
      code: String(b.code ?? "").trim(),
      name: String(b.name ?? "").trim(),
      nipCode: b.nipCode != null ? String(b.nipCode) : null,
      logo: b.logo != null ? String(b.logo) : null,
    }))
    .filter((b) => b.code && b.name);
}

export async function fetchNombaBankCodes(): Promise<{ banks: NombaBank[]; result: NombaApiResult }> {
  const cfg = getNombaNigeriaConfig();
  const result = await nombaFetch(cfg.bankcodeUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  }, 60_000);
  const banks = result.ok ? normalizeNombaBanks(result.json) : [];
  return { banks, result };
}

export async function fetchNombaAccountLookup(
  accountNumber: string,
  bankcode: string,
): Promise<{ accountName: string | null; result: NombaApiResult }> {
  const cfg = getNombaNigeriaConfig();
  const url = new URL(cfg.lookupUrl);
  url.searchParams.set("account_number", accountNumber);
  url.searchParams.set("bankcode", bankcode);
  const result = await nombaFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  }, 20_000);

  const outer = (result.json.data ?? result.json) as Record<string, unknown>;
  const inner = (outer?.data ?? outer) as Record<string, unknown>;
  const accountName = String(
    inner?.account_name ?? inner?.accountName ?? inner?.name ?? outer?.account_name ?? "",
  ).trim() || null;

  return { accountName: result.ok ? accountName : null, result };
}

export function extractNombaExchangeRates(json: Record<string, unknown>): NombaExchangeRate[] {
  const outer = (json.data ?? json) as Record<string, unknown>;
  const inner = (outer?.data ?? outer) as Record<string, unknown>;
  const rates = Array.isArray(inner?.rates) ? inner.rates : [];
  return (rates as Record<string, unknown>[]).map((r) => {
    const midRate = String(r.midRate ?? r.mid_rate ?? "");
    return {
      pair: String(r.currencyPairName ?? r.pair ?? ""),
      bidRate: String(r.bidRate ?? r.bid_rate ?? ""),
      askRate: String(r.askRate ?? r.ask_rate ?? ""),
      midRate,
      midRateNumeric: parseMidRateNumeric(midRate),
    };
  });
}

export async function fetchNombaExchangeRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<{ rates: NombaExchangeRate[]; result: NombaApiResult }> {
  const cfg = getNombaNigeriaConfig();
  const url = new URL(cfg.exchangeUrl);
  url.searchParams.set("from_dat", fromCurrency.toUpperCase());
  url.searchParams.set("to", toCurrency.toUpperCase());
  const result = await nombaFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  }, 20_000);
  const rates = extractNombaExchangeRates(result.json);
  return { rates, result };
}

export async function nombaTransferConversion(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<NombaConversionResult> {
  const cfg = getNombaNigeriaConfig();
  const url = new URL(cfg.conversionUrl);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("from_currency", fromCurrency.toUpperCase());
  url.searchParams.set("to_currency", toCurrency.toUpperCase());
  const result = await nombaFetch(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  }, 30_000);

  const outer = (result.json.data ?? result.json) as Record<string, unknown>;
  const inner = (outer?.data ?? outer) as Record<string, unknown>;
  const convertedAmount = Number(
    inner?.converted_amount ?? inner?.convertedAmount ?? inner?.amount ?? inner?.target_amount ?? NaN,
  );

  return {
    ...result,
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: toCurrency.toUpperCase(),
    convertedAmount: Number.isFinite(convertedAmount) && convertedAmount > 0 ? convertedAmount : null,
  };
}

export async function nombaBankTransfer(params: {
  amount: number;
  account_number: string;
  bankcode: string;
  account_name: string;
  ref_text: string;
  narrative: string;
}): Promise<NombaTransferResult> {
  const cfg = getNombaNigeriaConfig();
  const url = new URL(cfg.transferUrl);
  url.searchParams.set("amount", String(params.amount));
  url.searchParams.set("account_number", params.account_number);
  url.searchParams.set("bankcode", params.bankcode);
  url.searchParams.set("account_name", params.account_name);
  url.searchParams.set("ref_text", params.ref_text);
  url.searchParams.set("narrative", params.narrative.slice(0, 120));
  const result = await nombaFetch(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  }, 60_000);

  const outer = (result.json.data ?? result.json) as Record<string, unknown>;
  const inner = (outer?.data ?? outer) as Record<string, unknown>;
  const providerRef = String(
    inner?.reference ?? inner?.transaction_id ?? inner?.order_id ?? inner?.id ?? params.ref_text,
  ).trim() || null;

  return { ...result, providerRef };
}
