/**
 * CAD collect rail ranking (edge). Keep in sync with src/lib/cadCollectCheckout.ts.
 */

export const CAD_COLLECT_RAIL_COST_RANK: Record<string, number> = {
  interac: 10,
  fincra: 12,
  wise: 20,
  bambora: 25,
  nomba: 40,
  dodo: 50,
  paypal: 55,
  paytota: 60,
};

export const CAD_COLLECT_UNSAFE_RAILS = [
  "flutterwave",
  "flw",
  "paytota",
  "swychr",
  "ghana_pay",
  "elicate",
  "flovide",
  "paysafe",
  "flovide_interac",
] as const;

export function cadCollectRailCostRank(railId: string): number {
  const id = railId.trim().toLowerCase();
  if (id === "fincra_interac") return CAD_COLLECT_RAIL_COST_RANK.interac;
  if (id in CAD_COLLECT_RAIL_COST_RANK) return CAD_COLLECT_RAIL_COST_RANK[id];
  return 100;
}

export function isCadUnsafeCollectRail(railId: string): boolean {
  return (CAD_COLLECT_UNSAFE_RAILS as readonly string[]).includes(railId.trim().toLowerCase());
}

export function orderCadCollectRails(rails: string[]): string[] {
  const seen = new Set<string>();
  const known: string[] = [];
  const unknown: string[] = [];
  for (const raw of rails) {
    const r = raw.trim().toLowerCase();
    if (!r || seen.has(r) || isCadUnsafeCollectRail(r)) continue;
    seen.add(r);
    if (r in CAD_COLLECT_RAIL_COST_RANK || r === "fincra_interac") known.push(r);
    else unknown.push(r);
  }
  known.sort((a, b) => cadCollectRailCostRank(a) - cadCollectRailCostRank(b));
  return [...known, ...unknown];
}

/** Default CAD collect chain when no policy row exists. */
export const DEFAULT_CAD_COLLECT_RAILS = ["interac", "wise", "nomba", "dodo"] as const;
