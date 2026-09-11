export type AdminSearchHit = {
  id: string;
  label: string;
  group: string;
  to: string;
  keywords: string;
};

const partner = (panel: string, label: string, extra = "") =>
  ({
    id: `partner-${panel}`,
    label,
    group: "Partners & Pricing",
    to: `/admin/pricing?tab=partners&panel=${panel}`,
    keywords: extra,
  }) satisfies AdminSearchHit;

/** Pages, sidebar items, and inner tabs the header search can jump to. */
export const ADMIN_SEARCH_CATALOG: AdminSearchHit[] = [
  { id: "dash", label: "Dashboard", group: "Home", to: "/admin/dashboard", keywords: "overview kyc home" },
  { id: "simple-admin", label: "Simple admin", group: "Home", to: "/admin/simple", keywords: "simple users rates fees nomba fincra clean" },
  { id: "board", label: "Board", group: "Home", to: "/admin/board-dashboard", keywords: "board dashboard" },
  { id: "portal", label: "My portal", group: "Home", to: "/admin/portal", keywords: "staff portal payslip" },

  { id: "simple-users", label: "Simple · Users", group: "Simple admin", to: "/admin/simple/users", keywords: "customers 360 money tickets" },
  { id: "simple-rates", label: "Simple · Partners & Rates", group: "Simple admin", to: "/admin/simple/rates", keywords: "fees fx rails nomba fincra" },

  partner("rails", "Corridor rails", "who moves money send top-up"),
  partner("partners", "Partners", "active inactive mailing address fincra paypal square"),
  partner("relationships", "Partner relationships", "crm contacts addresses mailing"),
  partner("corridors", "Corridors", "country currency method"),
  partner("features", "Partner features", "test connection live ready"),
  partner("activation", "Network activation", "seed pricing fx retail preview apply"),
  partner("pricing", "Partner pricing", "fees cost rate card"),
  partner("fx", "Partner FX", "rates live manual"),
  partner("customer", "Customer pricing", "retail margin"),
  partner("liquidity", "Liquidity", "float"),
  partner("strategy", "Routing strategy", "lowest cost profit"),
  partner("live", "Live routing", "shadow switch with live cheapest rail engine"),
  partner("simulator", "Route simulator", "least cost quote what if"),
  partner("readiness", "Readiness", "corridor ready"),
  partner("attempts", "Routing attempts", "history"),
  partner("profitability", "Profitability", "margin"),
  partner("cost", "Cost assurance", "charges"),
  partner("settlements", "Settlements", ""),
  partner("guardrails", "Guardrails", "margin floor"),
  partner("recommendations", "Recommendations", "auto pricing"),
  partner("fee-adjustments", "Fee adjustments", "discount volume override"),
  partner("scorecards", "Scorecards", ""),
  partner("forecast", "Forecast", ""),
  partner("runway", "Float runway", "liquidity forecast"),
  partner("incidents", "Partner incidents", ""),
  partner("limits", "Limits", ""),
  partner("api", "API partners", ""),
  partner("alerts", "Partner alerts", ""),

  { id: "pricing-rates", label: "Pricing & Rates", group: "Partners & Pricing", to: "/admin/pricing?tab=pricing-rates", keywords: "fx corridor wallet volume discount cost recovery excel" },
  { id: "rate-card", label: "Rate card", group: "Partners & Pricing", to: "/admin/pricing?tab=rate-card", keywords: "customer fee" },
  { id: "nomba-fincra", label: "Nomba & Fincra", group: "Partners & Pricing", to: "/admin/nomba-fincra", keywords: "primary providers payout collect rates transactions interac" },
  { id: "ops", label: "Ops queue", group: "Partners & Pricing", to: "/admin/ops-queue", keywords: "transfers payout boost refund" },
  { id: "api-mgmt", label: "Payment APIs", group: "Partners & Pricing", to: "/admin/api", keywords: "fincra paypal square flovide flutterwave test connection secrets" },

  { id: "kyc", label: "KYC Queue", group: "Queue", to: "/admin/kyc", keywords: "identity review" },
  { id: "kyb", label: "KYB Queue", group: "Queue", to: "/admin/kyb", keywords: "business" },
  { id: "users", label: "Users", group: "Users", to: "/admin/users", keywords: "customer account" },
  { id: "biz", label: "Businesses", group: "Users", to: "/admin/businesses", keywords: "kyb company" },
  { id: "staff", label: "Staff", group: "Users", to: "/admin/staff", keywords: "admin roles" },

  { id: "finance", label: "Finance", group: "Finance", to: "/admin/finance", keywords: "treasury reports statements ledger" },
  { id: "revenue", label: "Revenue", group: "Finance", to: "/admin/revenue", keywords: "" },
  { id: "payroll", label: "Payroll", group: "Finance", to: "/admin/payroll", keywords: "salary" },
  { id: "settle", label: "Settlement Rec.", group: "Finance", to: "/admin/settlement-reconciliation", keywords: "reconcile" },
  { id: "period", label: "Period-End", group: "Finance", to: "/admin/period-end-controls", keywords: "close" },
  { id: "evidence", label: "Evidence Repo", group: "Finance", to: "/admin/evidence-repository", keywords: "" },

  { id: "operations", label: "Operations", group: "Operations", to: "/admin/operations", keywords: "" },
  { id: "comms", label: "Communication", group: "Operations", to: "/admin/communication", keywords: "email sms" },
  { id: "support", label: "Support", group: "Operations", to: "/admin/support", keywords: "tickets inbox" },
  { id: "training", label: "Training", group: "Operations", to: "/admin/training", keywords: "" },

  { id: "cdd", label: "CDD", group: "Compliance", to: "/admin/cdd", keywords: "" },
  { id: "edd", label: "EDD", group: "Compliance", to: "/admin/edd", keywords: "" },
  { id: "own", label: "Ownership", group: "Compliance", to: "/admin/beneficial-ownership", keywords: "ubo" },
  { id: "creg", label: "Compliance Reg.", group: "Compliance", to: "/admin/compliance-register", keywords: "" },
  { id: "aml", label: "AML Policy", group: "Compliance", to: "/admin/aml-policy", keywords: "" },
  { id: "kyc-cfg", label: "KYC Config", group: "Compliance", to: "/admin/kyc-config", keywords: "tiers limits" },
  { id: "risk", label: "Risk Tiers", group: "Compliance", to: "/admin/risk-tiers", keywords: "" },

  { id: "sanctions", label: "Sanctions", group: "Screening", to: "/admin/sanctions", keywords: "" },
  { id: "pep", label: "PEP Screening", group: "Screening", to: "/admin/pep-screening", keywords: "" },
  { id: "geo", label: "Geo Risk", group: "Screening", to: "/admin/geographic-risk", keywords: "" },

  { id: "txmon", label: "TX Monitor", group: "Monitoring", to: "/admin/transaction-monitoring", keywords: "" },
  { id: "trade", label: "Trade AML", group: "Monitoring", to: "/admin/trade-aml", keywords: "" },
  { id: "corr", label: "Correspond. Banks", group: "Monitoring", to: "/admin/correspondent-banking", keywords: "" },
  { id: "travel", label: "Travel Rule", group: "Monitoring", to: "/admin/travel-rule", keywords: "" },
  { id: "lctr", label: "LCTR", group: "Monitoring", to: "/admin/lctr", keywords: "" },
  { id: "eftr", label: "EFTR", group: "Monitoring", to: "/admin/eftr", keywords: "" },
  { id: "wire", label: "Wire Act", group: "Monitoring", to: "/admin/wire-transfers", keywords: "" },
  { id: "regch", label: "Reg. Changes", group: "Monitoring", to: "/admin/regulatory-changes", keywords: "" },

  { id: "audit", label: "Audit Log", group: "Audit & Reporting", to: "/admin/audit-log", keywords: "" },
  { id: "str", label: "STR / SAR", group: "Audit & Reporting", to: "/admin/str-filing", keywords: "" },
  { id: "auditor", label: "Auditor Portal", group: "Audit & Reporting", to: "/admin/auditor-portal", keywords: "" },

  { id: "sec", label: "Security", group: "Security", to: "/admin/security", keywords: "" },
  { id: "inc", label: "Incidents", group: "Security", to: "/admin/incidents", keywords: "" },
  { id: "oprisk", label: "Operational risk", group: "Security", to: "/admin/operational-risks", keywords: "" },

  { id: "settings", label: "Settings", group: "System", to: "/admin/settings", keywords: "" },
  { id: "diag", label: "Diagnostics", group: "System", to: "/admin/diagnostics", keywords: "" },
  { id: "export", label: "Data export", group: "System", to: "/admin/data-export", keywords: "" },

  { id: "dev", label: "Developer dashboard", group: "Developer", to: "/admin/developer", keywords: "" },
  { id: "dev-u", label: "Onboard user", group: "Developer", to: "/admin/developer/onboard-user", keywords: "" },
  { id: "dev-b", label: "Onboard business", group: "Developer", to: "/admin/developer/onboard-business", keywords: "" },
  { id: "dev-m", label: "Onboarded by me", group: "Developer", to: "/admin/developer/onboarded", keywords: "" },
];

export function searchAdminCatalog(query: string, limit = 20): AdminSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return ADMIN_SEARCH_CATALOG.slice(0, 12);
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = ADMIN_SEARCH_CATALOG.map((hit) => {
    const hay = `${hit.label} ${hit.group} ${hit.keywords} ${hit.to}`.toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) return null;
    const label = hit.label.toLowerCase();
    let score = 0;
    if (label === q) score += 100;
    else if (label.startsWith(q)) score += 60;
    else if (label.includes(q)) score += 40;
    if (hit.keywords.toLowerCase().includes(q)) score += 20;
    score += Math.max(0, 10 - tokens.length);
    return { hit, score };
  }).filter((x): x is { hit: AdminSearchHit; score: number } => !!x);
  scored.sort((a, b) => b.score - a.score || a.hit.label.localeCompare(b.hit.label));
  return scored.slice(0, limit).map((s) => s.hit);
}
