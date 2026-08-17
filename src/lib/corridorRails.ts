import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RailDirection = "collect" | "payout";

export type CorridorRailPolicy = {
  id: string;
  direction: RailDirection;
  country_code: string;
  currency_code: string;
  preferred_partner: string;
  failover_partners: string[];
  enabled: boolean;
  notes: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const RAIL_OPTIONS = [
  "fincra",
  "nomba",
  "flovide",
  "flutterwave",
  "lenhub_flutter",
  "paytota",
  "swychr",
  "ghana_pay",
  "elicate",
  "dodo",
  "square",
  "paypal",
  "wise",
  "interac",
] as const;

/** Notes tag so we only re-enable rules we turned off with the Partners toggle. */
export const PARTNER_AUTO_OFF_TAG = "[auto-off:partner]";

/**
 * payment_partners.code → corridor rail ids stored on corridor_rail_policies.
 * Codes don't always match (ghana vs ghana_pay, lenhub vs lenhub_flutter).
 */
export function partnerCodeToRailIds(code: string): string[] {
  const c = code.trim().toLowerCase().replace(/-/g, "_");
  const map: Record<string, string[]> = {
    fincra: ["fincra"],
    nomba: ["nomba"],
    flovide: ["flovide"],
    flutterwave: ["flutterwave"],
    flw: ["flutterwave"],
    lenhub: ["lenhub_flutter"],
    lenhub_flutter: ["lenhub_flutter"],
    paytota: ["paytota"],
    swychr: ["swychr"],
    ghana: ["ghana_pay"],
    ghana_pay: ["ghana_pay"],
    elicate: ["elicate"],
    dodo: ["dodo"],
    square: ["square"],
    paypal: ["paypal"],
    wise: ["wise"],
    interac: ["interac"],
  };
  if (map[c]) return map[c];
  if ((RAIL_OPTIONS as readonly string[]).includes(c)) return [c];
  return [];
}

export type PartnerRailStatus = { code: string; status?: string | null };

/** Rails with no partner row stay usable so unknown/legacy ids are not hidden. */
export function activeRailSetFromPartners(partners: PartnerRailStatus[]): Set<string> {
  const known = new Set<string>();
  const active = new Set<string>();
  for (const p of partners) {
    for (const rail of partnerCodeToRailIds(p.code || "")) {
      known.add(rail);
      if (p.status === "active") active.add(rail);
    }
  }
  for (const r of RAIL_OPTIONS) {
    if (!known.has(r)) active.add(r);
  }
  return active;
}

export function isRailActiveForPartners(railId: string, partners: PartnerRailStatus[]): boolean {
  return activeRailSetFromPartners(partners).has(railId.trim().toLowerCase());
}

async function loadPartnerRailStatuses(): Promise<PartnerRailStatus[]> {
  const { data, error } = await supabase
    .from("payment_partners" as never)
    .select("code,status");
  if (error) throw error;
  return (data || []) as PartnerRailStatus[];
}

/** Turn matching corridor rules off/on when a partner is toggled on the Partners tab. */
export async function syncCorridorRailsForPartnerStatus(partnerCode: string, active: boolean) {
  const rails = partnerCodeToRailIds(partnerCode);
  if (!rails.length) return 0;
  const railSet = new Set(rails);
  const { data, error } = await supabase.from("corridor_rail_policies" as never).select("*");
  if (error) throw error;
  const rows = (data || []) as CorridorRailPolicy[];
  let changed = 0;

  for (const row of rows) {
    const preferred = (row.preferred_partner || "").toLowerCase();
    if (!railSet.has(preferred)) continue;
    const notes = row.notes || "";
    const tagged = notes.includes(PARTNER_AUTO_OFF_TAG);

    if (!active) {
      if (!row.enabled && tagged) continue;
      const nextNotes = tagged ? notes : `${PARTNER_AUTO_OFF_TAG} ${notes}`.trim();
      const { error: upErr } = await supabase
        .from("corridor_rail_policies" as never)
        .update({
          enabled: false,
          notes: nextNotes,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", row.id);
      if (upErr) throw upErr;
      changed += 1;
    } else if (tagged) {
      const nextNotes = notes.replace(PARTNER_AUTO_OFF_TAG, "").trim() || null;
      const { error: upErr } = await supabase
        .from("corridor_rail_policies" as never)
        .update({
          enabled: true,
          notes: nextNotes,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", row.id);
      if (upErr) throw upErr;
      changed += 1;
    }
  }
  return changed;
}

const COLLECT_METHOD: Record<string, string> = {
  fincra: "fincra",
  nomba: "nomba",
  flovide: "interac",
  interac: "interac",
  flutterwave: "flutterwave",
  paytota: "paytota",
  swychr: "swychr",
  dodo: "dodo",
  square: "square",
  paypal: "paypal",
  wise: "wise",
  ghana_pay: "ghana",
  elicate: "elicate",
  lenhub_flutter: "lenhub",
};

export function collectMethodForPartner(partner: string): string | null {
  return COLLECT_METHOD[partner.trim().toLowerCase()] || null;
}

/** Code default when no collect policy is saved. */
export const DEFAULT_COLLECT_PARTNER: Record<string, string> = {
  CAD: "interac",
  USD: "square",
  EUR: "square",
  GBP: "square",
  NGN: "fincra",
  GHS: "fincra",
  KES: "fincra",
  UGX: "fincra",
  TZS: "fincra",
  ZMW: "fincra",
  ZAR: "fincra",
  XAF: "fincra",
  XOF: "fincra",
  MWK: "fincra",
  RWF: "paytota",
};

export function defaultCollectPartner(currency: string): string | null {
  return DEFAULT_COLLECT_PARTNER[currency.toUpperCase()] || null;
}

/** Map a collect partner / method onto TopUpPage method ids. */
export function collectPayMethodIds(partnerOrMethod: string): string[] {
  const raw = partnerOrMethod.trim().toLowerCase();
  const method = collectMethodForPartner(raw) || raw;
  if (method === "square" || method === "paypal") return ["square"];
  if (method === "interac") return ["interac", "plaid"];
  if (method === "flutterwave") return ["flw_hosted", "flw_momo"];
  if (method === "wise") return ["wise", "wise_link"];
  if (method === "ghana") return ["ghana"];
  if (method === "elicate") return ["elicate"];
  if (method === "lenhub") return ["lenhub"];
  return [method];
}

export function useCorridorRailPolicies() {
  return useQuery({
    queryKey: ["corridor_rail_policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corridor_rail_policies" as never)
        .select("*")
        .order("direction")
        .order("currency_code");
      if (error) throw error;
      return (data || []) as CorridorRailPolicy[];
    },
  });
}

export function useSaveCorridorRailPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<CorridorRailPolicy> & {
      direction: RailDirection;
      currency_code: string;
      preferred_partner: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        direction: row.direction,
        country_code: (row.country_code || "").toUpperCase(),
        currency_code: row.currency_code.toUpperCase(),
        preferred_partner: row.preferred_partner.toLowerCase(),
        failover_partners: (row.failover_partners || []).map((p) => p.toLowerCase()),
        enabled: row.enabled !== false,
        notes: row.notes || null,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };
      // Never use .single() here — PostgREST returns 406 when RETURNING is empty.
      if (row.id) {
        const { data, error } = await supabase
          .from("corridor_rail_policies" as never)
          .update(payload as never)
          .eq("id", row.id)
          .select("*");
        if (error) throw new Error(error.message || error.code || "Update blocked");
        const updated = Array.isArray(data) ? data[0] : data;
        if (updated) return updated as CorridorRailPolicy;
      }

      const { data, error } = await supabase
        .from("corridor_rail_policies" as never)
        .upsert(payload as never, { onConflict: "direction,country_code,currency_code" })
        .select("*");
      if (error) throw new Error(error.message || error.code || "Save blocked");
      const saved = Array.isArray(data) ? data[0] : data;
      if (saved) return saved as CorridorRailPolicy;
      if (row.id) return { ...payload, id: row.id } as CorridorRailPolicy;
      throw new Error("Save did not return a row — try again, or check you are still signed in as admin.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corridor_rail_policies"] }),
  });
}

export function useDeleteCorridorRailPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("corridor_rail_policies" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corridor_rail_policies"] }),
  });
}

/** Resolve preferred collect method for a currency (client-side). */
export async function resolveCollectMethodPreference(
  currency: string,
  country?: string,
): Promise<{ method: string | null; rails: string[]; source: "policy" | "default" | "none" }> {
  const ccy = currency.toUpperCase();
  const cc = (country || "").toUpperCase();
  const { data: exact } = cc
    ? await supabase
      .from("corridor_rail_policies" as never)
      .select("*")
      .eq("direction", "collect")
      .eq("currency_code", ccy)
      .eq("country_code", cc)
      .eq("enabled", true)
      .maybeSingle()
    : { data: null };
  let row = exact as CorridorRailPolicy | null;
  if (!row) {
    const { data } = await supabase
      .from("corridor_rail_policies" as never)
      .select("*")
      .eq("direction", "collect")
      .eq("currency_code", ccy)
      .eq("country_code", "")
      .eq("enabled", true)
      .maybeSingle();
    row = data as CorridorRailPolicy | null;
  }
  if (!row) {
    const { data: anyRow } = await supabase
      .from("corridor_rail_policies" as never)
      .select("*")
      .eq("direction", "collect")
      .eq("currency_code", ccy)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    row = anyRow as CorridorRailPolicy | null;
  }
  let partners: PartnerRailStatus[] = [];
  try {
    partners = await loadPartnerRailStatuses();
  } catch {
    partners = [];
  }
  const activeRails = activeRailSetFromPartners(partners);
  const keepActive = (id: string) => activeRails.has(id);

  if (row) {
    const rails = [row.preferred_partner, ...(row.failover_partners || [])]
      .map((r) => r.toLowerCase())
      .filter(Boolean)
      .filter(keepActive);
    if (rails.length) {
      const method = collectMethodForPartner(rails[0] || "");
      return { method, rails, source: "policy" };
    }
  }
  const fallback = defaultCollectPartner(ccy);
  if (fallback && keepActive(fallback)) {
    return { method: collectMethodForPartner(fallback) || fallback, rails: [fallback], source: "default" };
  }
  return { method: null, rails: [], source: "none" };
}

/** Best-effort ops email for collect/top-up failures. */
export async function notifyOpsCollectFailure(details: Record<string, string | number | null | undefined>) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-alert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: `[Ops] Top-up issue — ${details.currency || details.rail || "collect"}`,
        headline: "Collect / top-up failure",
        details,
      }),
    });
  } catch {
    /* ignore */
  }
}
