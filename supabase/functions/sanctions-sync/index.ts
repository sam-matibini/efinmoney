// Sanctions list ingestion — pulls OFAC SDN and UN consolidated lists into
// public.aml_watchlist (upsert on source+source_id). Fault-tolerant per source:
// if one provider is unreachable the others still apply. Invoked on demand from
// the Sanctions Screening page and (optionally) on a schedule.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EntityType = "individual" | "entity" | "vessel" | "aircraft" | "unknown";

interface WatchRow {
  source: "ofac" | "un";
  source_id: string;
  name: string;
  name_normalized: string;
  aliases: string[];
  entity_type: EntityType;
  programs: string[];
  countries: string[];
  nationalities: string[];
  remarks: string | null;
  source_url: string | null;
  raw: unknown;
}

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/* ── OFAC SDN (CSV, no header) ── */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((v) => (v === "-0-" ? "" : v.trim()));
}

async function syncOfac(): Promise<WatchRow[]> {
  const SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
  const ALT_URL = "https://www.treasury.gov/ofac/downloads/alt.csv";

  // Aliases keyed by ent_num
  const aliasMap = new Map<string, string[]>();
  try {
    const altRes = await fetch(ALT_URL);
    if (altRes.ok) {
      const txt = await altRes.text();
      for (const line of txt.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const f = parseCsvLine(line); // ent_num, alt_num, alt_type, alt_name, remarks
        const ent = f[0];
        const alt = f[3];
        if (ent && alt) aliasMap.set(ent, [...(aliasMap.get(ent) || []), alt]);
      }
    }
  } catch (_) { /* aliases are best-effort */ }

  const res = await fetch(SDN_URL);
  if (!res.ok) throw new Error(`OFAC SDN fetch failed [${res.status}]`);
  const txt = await res.text();
  const rows: WatchRow[] = [];
  for (const line of txt.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line); // ent_num, name, type, program, title, ...remarks(last)
    const entNum = f[0];
    const name = f[1];
    if (!entNum || !name) continue;
    const typeRaw = (f[2] || "").toLowerCase();
    const entity_type: EntityType =
      typeRaw === "individual" ? "individual" :
      typeRaw === "vessel" ? "vessel" :
      typeRaw === "aircraft" ? "aircraft" :
      typeRaw === "" ? "entity" : "unknown";
    rows.push({
      source: "ofac",
      source_id: entNum,
      name,
      name_normalized: normalize(name),
      aliases: aliasMap.get(entNum) || [],
      entity_type,
      programs: (f[3] || "").split(/;\s*/).filter(Boolean),
      countries: [],
      nationalities: [],
      remarks: f[f.length - 1] || null,
      source_url: SDN_URL,
      raw: { ent_num: entNum, name, type: f[2], program: f[3] },
    });
  }
  return rows;
}

/* ── UN consolidated (XML, best-effort regex extraction) ── */
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}
function allTags(block: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push(m[1].trim());
  return out;
}

async function syncUn(): Promise<WatchRow[]> {
  const URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`UN list fetch failed [${res.status}]`);
  const xml = await res.text();
  const rows: WatchRow[] = [];

  const pushBlocks = (blockTag: string, type: EntityType, indiv: boolean) => {
    for (const block of allTags(xml, blockTag)) {
      const id = tag(block, "DATAID") || tag(block, "REFERENCE_NUMBER");
      if (!id) continue;
      const name = indiv
        ? ["FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME"].map((t) => tag(block, t)).filter(Boolean).join(" ").trim()
        : (tag(block, "FIRST_NAME") || "").trim();
      if (!name) continue;
      const aliases = allTags(block, "ALIAS_NAME").map((a) => a.trim()).filter(Boolean);
      const nationalities = allTags(block, "NATIONALITY").map((n) => (tag(n, "VALUE") || n).trim()).filter(Boolean);
      rows.push({
        source: "un",
        source_id: id,
        name,
        name_normalized: normalize(name),
        aliases,
        entity_type: type,
        programs: [tag(block, "UN_LIST_TYPE") || "UN"].filter(Boolean) as string[],
        countries: [],
        nationalities,
        remarks: tag(block, "COMMENTS1"),
        source_url: URL,
        raw: { dataid: id, name },
      });
    }
  };
  pushBlocks("INDIVIDUAL", "individual", true);
  pushBlocks("ENTITY", "entity", false);
  return rows;
}

async function upsertAll(supabase: ReturnType<typeof createClient>, rows: WatchRow[]) {
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("aml_watchlist")
      .upsert(chunk, { onConflict: "source,source_id", ignoreDuplicates: false });
    if (error) throw error;
    upserted += chunk.length;
  }
  return upserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const result: Record<string, { count: number; error?: string }> = {};

  for (const [name, fn] of [["ofac", syncOfac], ["un", syncUn]] as const) {
    try {
      const rows = await fn();
      const n = await upsertAll(supabase, rows);
      result[name] = { count: n };
    } catch (err) {
      result[name] = { count: 0, error: err instanceof Error ? err.message : "failed" };
    }
  }

  const total = Object.values(result).reduce((s, r) => s + r.count, 0);
  return new Response(
    JSON.stringify({ success: total > 0, total, sources: result, synced_at: new Date().toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
