/**
 * CAD pay-in checkout: availability + least cost.
 * Lower rank = cheaper / preferred when the rail is live.
 *
 * Interac Autodeposit and bank EFT cost less than card (Nomba charges USD + FX).
 * Nomba Checkout is the live CAD card rail and also requests bank/EFT on the
 * hosted page. Fincra hosted card is not a CAD collect rail.
 */

export const CAD_COLLECT_COST_RANK: Record<string, number> = {
  interac: 10,
  plaid: 12,
  wise: 20,
  bambora_eft: 25,
  nomba_eft: 30,
  nomba: 40,
  wise_link: 45,
  dodo: 50,
  paypal: 55,
  paytota: 60,
  fincra: 80,
  epay: 90,
};

/** Partner / corridor rail ids used in collect policy (not TopUp method ids). */
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

/** Top-up method ids that are live CAD collect (when the feature flag is on). */
export const CAD_COLLECT_METHOD_IDS = [
  "interac",
  "plaid",
  "wise",
  "bambora_eft",
  "nomba_eft",
  "nomba",
  "wise_link",
  "dodo",
] as const;

export function cadCollectCostRank(methodId: string): number {
  const id = methodId.trim().toLowerCase();
  if (id in CAD_COLLECT_COST_RANK) return CAD_COLLECT_COST_RANK[id];
  return 100;
}

export function cadCollectRailCostRank(railId: string): number {
  const id = railId.trim().toLowerCase();
  if (id === "fincra_interac") return CAD_COLLECT_RAIL_COST_RANK.interac;
  if (id in CAD_COLLECT_RAIL_COST_RANK) return CAD_COLLECT_RAIL_COST_RANK[id];
  return 100;
}

export function isCadUnsafeCollectRail(railId: string): boolean {
  return (CAD_COLLECT_UNSAFE_RAILS as readonly string[]).includes(railId.trim().toLowerCase());
}

/** Least-cost among available CAD collect rails. Unknown rails keep relative order at the end. */
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

export function orderCadCollectMethods<T extends { id: string }>(methods: T[]): T[] {
  return [...methods].sort((a, b) => {
    const d = cadCollectCostRank(a.id) - cadCollectCostRank(b.id);
    if (d !== 0) return d;
    return 0;
  });
}

export function defaultCadCollectRail(available: string[]): string | null {
  const ordered = orderCadCollectRails(available);
  return ordered[0] || null;
}

/** Funding sources on CAD Send after the customer taps Next / Confirm. */
export type CadSendFunding = "wallet" | "card" | "bank" | "interac" | "wise";

/**
 * Checkout rail for CAD Send pay-in.
 *
 * Linked bank / Plaid stays on EFT. Fincra Autodeposit is only when they
 * picked Interac. Plaid Auth does not pull CAD — the customer still pushes
 * EFT (or optional Interac) to Loop after the bank is linked.
 */
export function cadSendPayInCheckout(
  funding: CadSendFunding,
): "wallet" | "card" | "eft" | "interac" | "wise" {
  if (funding === "bank") return "eft";
  return funding;
}
