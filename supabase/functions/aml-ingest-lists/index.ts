import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { parse as parseXML } from "https://deno.land/x/xml@2.1.3/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SOURCES = {
  ofac: "https://www.treasury.gov/ofac/downloads/sdn.csv",
  un: "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
  uk: "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv",
  // EU & CA require auth tokens / paid mirrors. PEPs come from OpenSanctions free dataset.
  pep: "https://data.opensanctions.org/datasets/latest/peps/targets.simple.csv",
};

function normalize(s: string) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): string[][] {
  // Simple CSV parser supporting quoted multi-line fields
  const rows: string[][] = [];
  const lines: string[] = [];
  let buf = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQ = !inQ;
    if (c === "\n" && !inQ) { lines.push(buf); buf = ""; }
    else buf += c;
  }
  if (buf) lines.push(buf);
  for (const l of lines) {
    if (!l.trim()) continue;
    rows.push(parseCSVLine(l));
  }
  return rows;
}

type Row = {
  source: keyof typeof SOURCES;
  source_id: string;
  entity_type: "individual" | "entity" | "vessel" | "aircraft" | "unknown";
  name: string;
  aliases: string[];
  dob_year: number | null;
  dob: string | null;
  nationalities: string[];
  countries: string[];
  programs: string[];
  remarks: string | null;
  source_url: string;
};

async function fetchOFAC(): Promise<Row[]> {
  const res = await fetch(SOURCES.ofac);
  const text = await res.text();
  const rows = parseCSV(text);
  // SDN.CSV columns: ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Vess_type, Tonnage, GRT, Vess_flag, Vess_owner, Remarks
  return rows.map((r) => {
    const type = (r[2] || "").toLowerCase();
    let et: Row["entity_type"] = "unknown";
    if (type.includes("individual")) et = "individual";
    else if (type.includes("entity")) et = "entity";
    else if (type.includes("vessel")) et = "vessel";
    else if (type.includes("aircraft")) et = "aircraft";
    const remarks = r[11] || "";
    const dobMatch = remarks.match(/DOB\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4})/);
    let dobYear: number | null = null;
    if (dobMatch) {
      const y = dobMatch[1].match(/(\d{4})/);
      if (y) dobYear = Number(y[1]);
    }
    return {
      source: "ofac" as const,
      source_id: String(r[0] || ""),
      entity_type: et,
      name: r[1] || "",
      aliases: [],
      dob_year: dobYear,
      dob: null,
      nationalities: [],
      countries: [],
      programs: (r[3] || "").split(";").map((s) => s.trim()).filter(Boolean),
      remarks: remarks || null,
      source_url: SOURCES.ofac,
    };
  }).filter((x) => x.source_id && x.name);
}

async function fetchUK(): Promise<Row[]> {
  const res = await fetch(SOURCES.uk);
  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 3) return [];
  // UK OFSI: first 1-2 rows are metadata, then header row, then data
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].some((c) => /Group ID/i.test(c))) { headerIdx = i; break; }
  }
  const header = rows[headerIdx].map((h) => h.trim());
  const idx = (k: string) => header.findIndex((h) => h.toLowerCase() === k.toLowerCase());
  const iName1 = idx("Name 6");
  const iName2 = idx("Name 1");
  const iName3 = idx("Name 2");
  const iDOB = idx("DOB");
  const iNat = idx("Nationality");
  const iGroup = idx("Group ID");
  const iRegime = idx("Regime");
  const out: Row[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const nameParts = [r[iName2], r[iName3], r[iName1]].filter(Boolean).map((s) => s?.trim()).filter(Boolean);
    const name = nameParts.join(" ");
    if (!name) continue;
    const dob = (r[iDOB] || "").trim();
    let dobYear: number | null = null;
    const y = dob.match(/(\d{4})/);
    if (y) dobYear = Number(y[1]);
    out.push({
      source: "uk",
      source_id: `uk-${r[iGroup] || i}-${i}`,
      entity_type: "individual",
      name,
      aliases: [],
      dob_year: dobYear,
      dob: null,
      nationalities: (r[iNat] || "").split(";").map((s) => s.trim()).filter(Boolean),
      countries: [],
      programs: [(r[iRegime] || "").trim()].filter(Boolean),
      remarks: null,
      source_url: SOURCES.uk,
    });
  }
  return out;
}

async function fetchUN(): Promise<Row[]> {
  const res = await fetch(SOURCES.un);
  const text = await res.text();
  const doc: any = parseXML(text);
  const out: Row[] = [];
  const root = doc?.CONSOLIDATED_LIST;
  if (!root) return [];
  const indivs = root.INDIVIDUALS?.INDIVIDUAL ?? [];
  const list = Array.isArray(indivs) ? indivs : [indivs];
  for (const ind of list) {
    const name = [ind.FIRST_NAME, ind.SECOND_NAME, ind.THIRD_NAME, ind.FOURTH_NAME].filter(Boolean).join(" ");
    if (!name) continue;
    const aliasArr = ind.INDIVIDUAL_ALIAS;
    const aliases: string[] = [];
    if (aliasArr) {
      const a = Array.isArray(aliasArr) ? aliasArr : [aliasArr];
      for (const x of a) if (x?.ALIAS_NAME) aliases.push(String(x.ALIAS_NAME));
    }
    const dobNode = ind.INDIVIDUAL_DATE_OF_BIRTH;
    let dobYear: number | null = null;
    if (dobNode) {
      const d = Array.isArray(dobNode) ? dobNode[0] : dobNode;
      if (d?.YEAR) dobYear = Number(d.YEAR);
      else if (d?.DATE) {
        const m = String(d.DATE).match(/(\d{4})/);
        if (m) dobYear = Number(m[1]);
      }
    }
    out.push({
      source: "un",
      source_id: `un-${ind.DATAID || ind.REFERENCE_NUMBER || name}`,
      entity_type: "individual",
      name,
      aliases,
      dob_year: dobYear,
      dob: null,
      nationalities: ind.NATIONALITY ? [String(ind.NATIONALITY?.VALUE ?? ind.NATIONALITY)] : [],
      countries: [],
      programs: ind.UN_LIST_TYPE ? [String(ind.UN_LIST_TYPE)] : [],
      remarks: ind.COMMENTS1 ? String(ind.COMMENTS1) : null,
      source_url: SOURCES.un,
    });
  }
  const ents = root.ENTITIES?.ENTITY ?? [];
  const eList = Array.isArray(ents) ? ents : [ents];
  for (const e of eList) {
    const name = e.FIRST_NAME ? String(e.FIRST_NAME) : "";
    if (!name) continue;
    const aliasArr = e.ENTITY_ALIAS;
    const aliases: string[] = [];
    if (aliasArr) {
      const a = Array.isArray(aliasArr) ? aliasArr : [aliasArr];
      for (const x of a) if (x?.ALIAS_NAME) aliases.push(String(x.ALIAS_NAME));
    }
    out.push({
      source: "un",
      source_id: `un-e-${e.DATAID || e.REFERENCE_NUMBER || name}`,
      entity_type: "entity",
      name,
      aliases,
      dob_year: null,
      dob: null,
      nationalities: [],
      countries: [],
      programs: e.UN_LIST_TYPE ? [String(e.UN_LIST_TYPE)] : [],
      remarks: e.COMMENTS1 ? String(e.COMMENTS1) : null,
      source_url: SOURCES.un,
    });
  }
  return out;
}

async function fetchPEP(): Promise<Row[]> {
  const res = await fetch(SOURCES.pep);
  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.findIndex((h) => h === k.toLowerCase());
  const iId = idx("id");
  const iName = idx("name");
  const iAliases = idx("aliases");
  const iDob = idx("birth_date");
  const iCountries = idx("countries");
  const out: Row[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[iName] || "").trim();
    if (!name) continue;
    const dob = (r[iDob] || "").trim();
    let dobYear: number | null = null;
    const y = dob.match(/(\d{4})/);
    if (y) dobYear = Number(y[1]);
    out.push({
      source: "pep",
      source_id: r[iId] || `pep-${i}`,
      entity_type: "individual",
      name,
      aliases: (r[iAliases] || "").split(";").map((s) => s.trim()).filter(Boolean),
      dob_year: dobYear,
      dob: null,
      nationalities: [],
      countries: (r[iCountries] || "").split(";").map((s) => s.trim()).filter(Boolean),
      programs: ["PEP"],
      remarks: null,
      source_url: SOURCES.pep,
    });
  }
  return out;
}

async function upsertRows(supabase: any, source: string, rows: Row[]) {
  if (!rows.length) return 0;
  const batched = rows.map((r) => ({
    source: r.source,
    source_id: r.source_id,
    entity_type: r.entity_type,
    name: r.name,
    name_normalized: normalize(r.name),
    aliases: r.aliases,
    dob: r.dob,
    dob_year: r.dob_year,
    nationalities: r.nationalities,
    countries: r.countries,
    programs: r.programs,
    remarks: r.remarks,
    source_url: r.source_url,
    list_published_at: new Date().toISOString(),
    ingested_at: new Date().toISOString(),
  }));
  // Insert in chunks of 500
  let inserted = 0;
  for (let i = 0; i < batched.length; i += 500) {
    const chunk = batched.slice(i, i + 500);
    const { error } = await supabase.from("aml_watchlist").upsert(chunk, { onConflict: "source,source_id" });
    if (error) {
      console.error(`${source} upsert error`, error);
      throw error;
    }
    inserted += chunk.length;
  }
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  const only = url.searchParams.get("source");

  const results: Record<string, number | string> = {};
  const tasks: Array<[string, () => Promise<Row[]>]> = [
    ["ofac", fetchOFAC],
    ["un", fetchUN],
    ["uk", fetchUK],
    ["pep", fetchPEP],
  ];

  for (const [name, fn] of tasks) {
    if (only && only !== name) continue;
    try {
      const rows = await fn();
      const n = await upsertRows(supabase, name, rows);
      results[name] = n;
    } catch (e: any) {
      console.error(`ingest ${name} failed`, e);
      results[name] = `error: ${e?.message ?? e}`;
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
