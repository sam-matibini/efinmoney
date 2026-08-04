// Sanctions list ingestion — pulls OFAC SDN, UN consolidated and Global Affairs
// Canada (SEMA) lists into public.aml_watchlist (upsert on source+source_id).
// if one provider is unreachable the others still apply. Invoked on demand from
// the Sanctions Screening page and (optionally) on a schedule.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EntityType = "individual" | "entity" | "vessel" | "aircraft" | "unknown";

interface WatchRow {
  source: "ofac" | "un" | "gac";
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

/* ── Global Affairs Canada — SEMA consolidated autonomous sanctions ── */
const GAC_URL =
  "https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xml";

/** GAC publishes bilingual labels such as "Belarus / Bélarus". */
const gacCountryLabels = (value: string) =>
  [...new Set(value.split(/\s*\/\s*/).flatMap((label) => {
    const trimmed = label.trim();
    const withoutTranslation = trimmed.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    return [trimmed, withoutTranslation].filter(Boolean);
  }))];

async function syncGac(): Promise<WatchRow[]> {
  const res = await fetch(GAC_URL);
  if (!res.ok) throw new Error(`GAC SEMA fetch failed [${res.status}]`);
  const xml = await res.text();
  const rows: WatchRow[] = [];
  let idx = 0;

  for (const block of allTags(xml, "record")) {
    const country = tag(block, "Country") || tag(block, "Pays") || "";
    const countryLabels = gacCountryLabels(country);
    const entity = tag(block, "Entity");
    const given = tag(block, "GivenName");
    const last = tag(block, "LastName");
    const name = (entity || [given, last].filter(Boolean).join(" ")).trim();
    if (!name) continue;
    const schedule = tag(block, "Schedule") || "";
    const item = tag(block, "Item") || String(++idx);
    const aliases = (tag(block, "Aliases") || "")
      .split(/\s*[;,]\s*/).map((a) => a.trim()).filter(Boolean);

    rows.push({
      source: "gac",
      source_id: `${country}-${schedule}-${item}`.replace(/\s+/g, "_"),
      name,
      name_normalized: normalize(name),
      aliases,
      entity_type: entity ? "entity" : "individual",
      programs: [countryLabels[0] ? `SEMA ${countryLabels[0]}` : "", schedule].filter(Boolean) as string[],
      countries: countryLabels,
      nationalities: [],
      remarks: tag(block, "DateOfBirth") ? `DOB: ${tag(block, "DateOfBirth")}` : null,
      source_url: GAC_URL,
      raw: { country, schedule, item, name },
    });
  }
  return rows;
}

/** Canonical aliases so GAC country labels line up with the risk register. */
const COUNTRY_ALIASES: Record<string, string[]> = {
  ru: ["russia", "russian federation"],
  by: ["belarus", "republic of belarus"],
  kp: ["north korea", "democratic peoples republic of korea", "dprk", "korea north"],
  mm: ["myanmar", "burma"],
  ir: ["iran", "islamic republic of iran"],
  sy: ["syria", "syrian arab republic"],
  ve: ["venezuela", "bolivarian republic of venezuela"],
  zw: ["zimbabwe"],
  ss: ["south sudan"],
  sd: ["sudan"],
  ml: ["mali"],
  ni: ["nicaragua"],
  ht: ["haiti"],
  ly: ["libya"],
  lb: ["lebanon"],
  md: ["moldova", "republic of moldova"],
  ua: ["ukraine"],
  gn: ["guinea"],
  cn: ["china", "peoples republic of china"],
  lk: ["sri lanka"],
  gt: ["guatemala"],
  pk: ["pakistan"],
  ye: ["yemen"],
  so: ["somalia"],
  cf: ["central african republic"],
  cd: ["democratic republic of the congo", "congo democratic republic", "drc"],
  iq: ["iraq"],
  tn: ["tunisia"],
  eg: ["egypt"],
};

/**
 * Countries Canada sanctions under the *United Nations Act* regulations rather
 * than SEMA. They never appear in the SEMA XML, so they are flagged statically.
 */
const CANADA_UN_ACT_COUNTRIES: Record<string, string> = {
  kp: "North Korea",
  ir: "Iran",
  ly: "Libya",
  so: "Somalia",
  ss: "South Sudan",
  sd: "Sudan",
  ye: "Yemen",
  cf: "Central African Republic",
  cd: "Democratic Republic of the Congo",
  ml: "Mali",
  iq: "Iraq",
  lb: "Lebanon",
  gw: "Guinea-Bissau",
  er: "Eritrea",
};


const canonCountry = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

async function flagCanadaSanctionedCountries(
  supabase: ReturnType<typeof createClient>,
  rows: WatchRow[],
) {
  // Every country label mentioned by the GAC list, canonicalised.
  const listed = new Set<string>();
  for (const r of rows) {
    for (const c of r.countries) {
      const v = canonCountry(c);
      if (v) listed.add(v);
    }
    // SEMA programs carry the regime country too ("SEMA Russia")
    for (const p of r.programs || []) {
      const v = canonCountry(String(p).replace(/^sema\s*/i, ""));
      if (v) listed.add(v);
    }
  }
  if (!listed.size) return 0;

  // Expand with known aliases so either spelling matches.
  const expanded = new Set(listed);
  for (const [code, names] of Object.entries(COUNTRY_ALIASES)) {
    if (names.some((n) => listed.has(n))) {
      expanded.add(code);
      names.forEach((n) => expanded.add(n));
    }
  }

  // Countries sanctioned under the UN Act are always in scope.
  for (const [code, name] of Object.entries(CANADA_UN_ACT_COUNTRIES)) {
    expanded.add(code);
    expanded.add(canonCountry(name));
    (COUNTRY_ALIASES[code] || []).forEach((a) => expanded.add(a));
  }

  const { data } = await supabase
    .from("geographic_risk_ratings")
    .select("id, country_code, country_name, canada_sanctions");
  const list = (data || []) as {
    id: string; country_code: string | null; country_name: string; canada_sanctions: boolean;
  }[];

  let updated = 0;
  const seenCodes = new Set<string>();
  for (const c of list) {
    const nm = canonCountry(c.country_name);
    const code = (c.country_code || "").toLowerCase();
    if (code) seenCodes.add(code);
    const aliases = COUNTRY_ALIASES[code] || [];
    const hit = expanded.has(nm) ||
      (code.length === 2 && expanded.has(code)) ||
      aliases.some((a) => expanded.has(a));
    if (hit !== Boolean(c.canada_sanctions)) {
      await supabase
        .from("geographic_risk_ratings")
        .update({ canada_sanctions: hit, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      updated++;
    }
  }

  // Seed register rows for sanctioned countries that are not tracked yet, so
  // the risk register is complete rather than silently missing regimes.
  const missing: { country_code: string; country_name: string }[] = [];
  for (const [code, names] of Object.entries(COUNTRY_ALIASES)) {
    if (seenCodes.has(code)) continue;
    const sanctioned = expanded.has(code) || names.some((n) => expanded.has(n));
    if (!sanctioned) continue;
    const label = CANADA_UN_ACT_COUNTRIES[code] ||
      names[0].replace(/\b\w/g, (m) => m.toUpperCase());
    missing.push({ country_code: code.toUpperCase(), country_name: label });
  }
  if (missing.length) {
    const { error } = await supabase.from("geographic_risk_ratings").insert(
      missing.map((m) => ({
        ...m,
        canada_sanctions: true,
        risk_level: "high",
      })),
    );
    if (!error) updated += missing.length;
  }

  return updated;
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
  let countriesFlagged = 0;

  for (const [name, fn] of [["ofac", syncOfac], ["un", syncUn], ["gac", syncGac]] as const) {
    const startedAt = new Date().toISOString();
    try {
      const rows = await fn();
      const n = await upsertAll(supabase, rows);
      if (name === "gac") countriesFlagged = await flagCanadaSanctionedCountries(supabase, rows);
      result[name] = { count: n };
      await supabase.from("sanctions_sync_runs").insert({
        source: name, status: "success", rows_upserted: n,
        started_at: startedAt, finished_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      result[name] = { count: 0, error: message };
      await supabase.from("sanctions_sync_runs").insert({
        source: name, status: "error", rows_upserted: 0, error: message,
        started_at: startedAt, finished_at: new Date().toISOString(),
      });
    }
  }

  const total = Object.values(result).reduce((s, r) => s + r.count, 0);
  return new Response(
    JSON.stringify({
      success: total > 0,
      total,
      sources: result,
      countries_flagged: countriesFlagged,
      synced_at: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

