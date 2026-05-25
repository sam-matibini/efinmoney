// Helpers for extracting and labeling Persona risk tags surfaced via webhook payloads.
// Tags appear in: persona_verification_data.data.attributes.payload.data.attributes.tags

export type RiskSeverity = "critical" | "warning" | "info";

export interface RiskTagMeta {
  label: string;
  severity: RiskSeverity;
  description: string;
}

const TAG_META: Record<string, RiskTagMeta> = {
  "WATCHLIST MATCH": {
    label: "Watchlist match",
    severity: "critical",
    description: "Name matched a sanctions or watchlist entry — review carefully.",
  },
  "PEP MATCH": {
    label: "PEP match",
    severity: "critical",
    description: "Politically Exposed Person — enhanced due diligence required.",
  },
  "HIGH RISK SELFIE": {
    label: "High-risk selfie",
    severity: "warning",
    description: "Liveness score below threshold — possible bad lighting or spoof attempt.",
  },
  "TOR DETECTED": {
    label: "Tor / VPN detected",
    severity: "warning",
    description: "User connected via Tor or anonymizing proxy.",
  },
  "HIGH BEHAVIOR THREAT LEVEL": {
    label: "High behavior threat",
    severity: "warning",
    description: "Suspicious session behavior detected (bot-like input, rapid retries).",
  },
};

export function extractRiskTags(personaData: unknown): string[] {
  const data = personaData as
    | { data?: { attributes?: { payload?: { data?: { attributes?: { tags?: unknown } } } } } }
    | null
    | undefined;
  const tags = data?.data?.attributes?.payload?.data?.attributes?.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string");
}

export function tagMeta(tag: string): RiskTagMeta {
  return (
    TAG_META[tag.toUpperCase()] ?? {
      label: tag,
      severity: "info",
      description: tag,
    }
  );
}
