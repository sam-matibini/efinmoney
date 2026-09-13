/**
 * Load live corridor-provider FX quotes from partner_fx_rates + fx_rates.
 * Used by corridor-provider-fx and fx-engine.
 */
import {
  classifyPartnerFxRow,
  composeProviderCrossRate,
  resolveFxBenchmark,
  type CorridorProviderQuote,
  type FxBenchmark,
} from "./fxCorridorBenchmark.ts";
import { resolveMidMarketRate } from "./fxRatesCore.ts";
import { PARTNER_QUOTE_ADAPTERS } from "./partnerQuotes.ts";

type AnyClient = any;

type PartnerRow = { id: string; code: string | null; name: string | null; status?: string | null };
type CorridorRow = { partner_id: string; enabled?: boolean; source_currency: string; dest_currency: string };
type FxRow = {
  partner_id: string;
  base_currency: string;
  quote_currency: string;
  partner_rate: number;
  source: string | null;
  rate_timestamp: string | null;
  expires_at: string | null;
};
type TreasuryRow = { from_currency: string; to_currency: string; rate?: number | null; effective_rate?: number | null };

const up = (v: unknown) => String(v ?? "").toUpperCase();

function latestPerPartnerPair(rows: FxRow[]): FxRow[] {
  const seen = new Set<string>();
  const out: FxRow[] = [];
  for (const row of rows) {
    const key = `${row.partner_id}:${up(row.base_currency)}:${up(row.quote_currency)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export async function loadCorridorFxBenchmark(
  client: AnyClient,
  opts: {
    from: string;
    to: string;
    preferredPartner?: string | null;
  },
): Promise<FxBenchmark & { quotes: CorridorProviderQuote[]; treasuryMid: number | null }> {
  const from = up(opts.from);
  const to = up(opts.to);
  if (!from || !to || from === to) {
    return { rate: 1, source: "treasury_mid", partnerCode: null, quotes: [], treasuryMid: 1 };
  }

  const [{ data: corridors }, { data: treasuryRows }] = await Promise.all([
    client
      .from("partner_corridors")
      .select("partner_id,enabled,source_currency,dest_currency")
      .eq("enabled", true)
      .eq("source_currency", from)
      .eq("dest_currency", to),
    client
      .from("fx_rates")
      .select("from_currency,to_currency,rate,effective_rate")
      .or("valid_until.is.null,valid_until.gt." + new Date().toISOString())
      .order("valid_from", { ascending: false })
      .limit(500),
  ]);

  const matching = ((corridors ?? []) as CorridorRow[]).filter((c) => c.enabled !== false);
  const partnerIds = [...new Set(matching.map((c) => c.partner_id))];

  let partners: PartnerRow[] = [];
  let fxRows: FxRow[] = [];
  if (partnerIds.length) {
    const [{ data: partnerData }, { data: fxData }] = await Promise.all([
      client.from("payment_partners").select("id,code,name,status").in("id", partnerIds),
      client
        .from("partner_fx_rates")
        .select("partner_id,base_currency,quote_currency,partner_rate,source,rate_timestamp,expires_at")
        .in("partner_id", partnerIds)
        .order("rate_timestamp", { ascending: false })
        .limit(800),
    ]);
    partners = (partnerData ?? []) as PartnerRow[];
    fxRows = latestPerPartnerPair((fxData ?? []) as FxRow[]);
  }

  const treasury = (treasuryRows ?? []) as TreasuryRow[];
  const treasuryMid = resolveMidMarketRate(from, to, treasury);
  const cadUsd = from !== "USD" && to !== "USD" ? resolveMidMarketRate(from, "USD", treasury) : null;

  const quotes: CorridorProviderQuote[] = [];
  const partnerOf = (id: string) => partners.find((p) => p.id === id);

  for (const row of fxRows) {
    const partner = partnerOf(row.partner_id);
    if (!partner || partner.status === "inactive" || partner.status === "suspended") continue;
    const code = String(partner.code || partner.name || "partner");
    const rate = Number(row.partner_rate);
    if (!(rate > 0)) continue;

    const base = up(row.base_currency);
    const quote = up(row.quote_currency);
    const classified = classifyPartnerFxRow({
      source: row.source,
      rateTimestamp: row.rate_timestamp,
      expiresAt: row.expires_at,
    });

    if (base === from && quote === to) {
      quotes.push({
        partnerCode: code,
        rate,
        source: classified,
        rateTimestamp: row.rate_timestamp,
        expiresAt: row.expires_at,
      });
      continue;
    }

    if (base === "USD" && quote === to && cadUsd) {
      const composed = composeProviderCrossRate(cadUsd, rate);
      if (composed) {
        quotes.push({
          partnerCode: code,
          rate: composed,
          source: classified === "live_api" ? "composed" : classified,
          rateTimestamp: row.rate_timestamp,
          expiresAt: row.expires_at,
        });
      }
    }
  }

  const livePulls = await Promise.all(
    partners.map(async (partner) => {
      const code = String(partner.code || "").toLowerCase();
      const adapter = PARTNER_QUOTE_ADAPTERS[code];
      if (!adapter || partner.status === "inactive" || partner.status === "suspended") return [] as CorridorProviderQuote[];
      const out: CorridorProviderQuote[] = [];
      const direct = await adapter(from, to);
      if (direct.ok && direct.rate) {
        out.push({ partnerCode: code, rate: direct.rate, source: "live_api" });
      } else if (from !== "USD" && to !== "USD") {
        const usdLeg = await adapter("USD", to);
        const composed = usdLeg.ok && usdLeg.rate ? composeProviderCrossRate(cadUsd, usdLeg.rate) : null;
        if (composed) out.push({ partnerCode: code, rate: composed, source: "composed" });
      }
      return out;
    }),
  );
  quotes.push(...livePulls.flat());

  const picked = resolveFxBenchmark({
    providerQuotes: quotes,
    preferredPartner: opts.preferredPartner,
    treasuryMid,
  });

  return { ...picked, quotes, treasuryMid: treasuryMid && treasuryMid > 0 ? treasuryMid : null };
}
