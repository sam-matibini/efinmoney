import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { parse as parseXML } from "https://deno.land/x/xml@2.1.3/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SOURCES = {
  ofac: "https://www.treasury.gov/ofac/downloads/sdn.csv",
  un: "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
  uk: "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv",
  pep: "https://data.opensanctions.org/datasets/latest/peps/targets.simple.csv",
};

const MAX_ROWS_PER_RUN = 20000;
const BATCH_SIZE = 500;

function normalize(s: string) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

type Row = {
  source: string;
  source_id: string;
  entity_type: string;
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

function rowToInsert(r: Row) {
  return {
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
  };
}

async function flushBatch(supabase: any, batch: Row[]) {
  if (!batch.length) return;
  const payload = batch.map(rowToInsert);
  const { error } = await supabase.from("aml_watchlist").upsert(payload, { onConflict: "source,source_id" });
  if (error) throw error;
}

// Stream CSV from a Response body, yield parsed lines as string[]
async function* streamCSV(res: Response): AsyncGenerator<string[]> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let inQ = false;
  let line = "";

  function* flushLine(l: string): Generator<string[]> {
    if (!l.trim()) return;
    // parse CSV line
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) {
        if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else {
        if (ch === ',') { out.push(cur); cur = ""; }
        else if (ch === '"') q = true;
        else cur += ch;
      }
    }
    out.push(cur);
    yield out;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i = 0;
    while (i < buf.length) {
      const c = buf[i];
      if (c === '"') inQ = !inQ;
      if (c === "\n" && !inQ) {
        for (const row of flushLine(line)) yield row;
        line = "";
      } else {
        line += c;
      }
      i++;
    }
    buf = "";
  }
  if (line) for (const row of flushLine(line)) yield row;
}

async function ingestOFAC(supabase: any): Promise<number> {
  const res = await fetch(SOURCES.ofac);
  let batch: Row[] = [];
  let count = 0;
  for await (const r of streamCSV(res)) {
    if (count >= MAX_ROWS_PER_RUN) break;
    if (!r[0] || !r[1]) continue;
    const type = (r[2] || "").toLowerCase();
    let et = "unknown";
    if (type.includes("individual")) et = "individual";
    else if (type.includes("entity")) et = "entity";
    else if (type.includes("vessel")) et = "vessel";
    else if (type.includes("aircraft")) et = "aircraft";
    const remarks = r[11] || "";
    const m = remarks.match(/DOB\s+[^;]*?(\d{4})/);
    batch.push({
      source: "ofac",
      source_id: String(r[0]),
      entity_type: et,
      name: r[1],
      aliases: [],
      dob_year: m ? Number(m[1]) : null,
      dob: null,
      nationalities: [],
      countries: [],
      programs: (r[3] || "").split(";").map((s) => s.trim()).filter(Boolean),
      remarks: remarks || null,
      source_url: SOURCES.ofac,
    });
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(supabase, batch);
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) { await flushBatch(supabase, batch); count += batch.length; }
  return count;
}

async function ingestUK(supabase: any): Promise<number> {
  const res = await fetch(SOURCES.uk);
  let batch: Row[] = [];
  let count = 0;
  let header: string[] | null = null;
  let headerSearchedRows = 0;
  let idx: Record<string, number> = {};
  let rowNum = 0;

  for await (const r of streamCSV(res)) {
    rowNum++;
    if (!header) {
      headerSearchedRows++;
      if (r.some((c) => /Group ID/i.test(c))) {
        header = r.map((h) => h.trim());
        header.forEach((h, i) => { idx[h.toLowerCase()] = i; });
      } else if (headerSearchedRows > 5) {
        break;
      }
      continue;
    }
    if (count >= MAX_ROWS_PER_RUN) break;
    const parts = [r[idx["name 1"]], r[idx["name 2"]], r[idx["name 6"]]].filter(Boolean).map((s) => s?.trim()).filter(Boolean);
    const name = parts.join(" ");
    if (!name) continue;
    const dob = (r[idx["dob"]] || "").trim();
    const y = dob.match(/(\d{4})/);
    batch.push({
      source: "uk",
      source_id: `uk-${r[idx["group id"]] || rowNum}-${rowNum}`,
      entity_type: "individual",
      name,
      aliases: [],
      dob_year: y ? Number(y[1]) : null,
      dob: null,
      nationalities: (r[idx["nationality"]] || "").split(";").map((s) => s.trim()).filter(Boolean),
      countries: [],
      programs: [(r[idx["regime"]] || "").trim()].filter(Boolean),
      remarks: null,
      source_url: SOURCES.uk,
    });
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(supabase, batch);
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) { await flushBatch(supabase, batch); count += batch.length; }
  return count;
}

async function ingestPEP(supabase: any, offset = 0, limit = MAX_ROWS_PER_RUN): Promise<{ count: number; next_offset: number | null }> {
  const res = await fetch(SOURCES.pep);
  let batch: Row[] = [];
  let count = 0;
  let header: string[] | null = null;
  let rowIdx = -1;
  let idx: Record<string, number> = {};

  for await (const r of streamCSV(res)) {
    rowIdx++;
    if (!header) {
      header = r.map((h) => h.trim().toLowerCase());
      header.forEach((h, i) => { idx[h] = i; });
      continue;
    }
    if (rowIdx <= offset) continue;
    if (count >= limit) {
      // cancel the stream by returning early; GC will close
      return { count, next_offset: rowIdx };
    }
    const name = (r[idx["name"]] || "").trim();
    if (!name) continue;
    const dob = (r[idx["birth_date"]] || "").trim();
    const y = dob.match(/(\d{4})/);
    batch.push({
      source: "pep",
      source_id: r[idx["id"]] || `pep-${rowIdx}`,
      entity_type: "individual",
      name,
      aliases: (r[idx["aliases"]] || "").split(";").map((s) => s.trim()).filter(Boolean).slice(0, 20),
      dob_year: y ? Number(y[1]) : null,
      dob: null,
      nationalities: [],
      countries: (r[idx["countries"]] || "").split(";").map((s) => s.trim()).filter(Boolean),
      programs: ["PEP"],
      remarks: null,
      source_url: SOURCES.pep,
    });
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(supabase, batch);
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) { await flushBatch(supabase, batch); count += batch.length; }
  return { count, next_offset: null };
}

async function ingestUN(supabase: any): Promise<number> {
  // UN XML is small enough (~5MB) to load fully
  const res = await fetch(SOURCES.un);
  const text = await res.text();
  const doc: any = parseXML(text);
  const root = doc?.CONSOLIDATED_LIST;
  if (!root) return 0;
  let batch: Row[] = [];
  let count = 0;
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
    let dobYear: number | null = null;
    const dobNode = ind.INDIVIDUAL_DATE_OF_BIRTH;
    if (dobNode) {
      const d = Array.isArray(dobNode) ? dobNode[0] : dobNode;
      if (d?.YEAR) dobYear = Number(d.YEAR);
      else if (d?.DATE) { const m = String(d.DATE).match(/(\d{4})/); if (m) dobYear = Number(m[1]); }
    }
    batch.push({
      source: "un",
      source_id: `un-${ind.DATAID || ind.REFERENCE_NUMBER || name}`,
      entity_type: "individual",
      name,
      aliases: aliases.slice(0, 20),
      dob_year: dobYear,
      dob: null,
      nationalities: ind.NATIONALITY ? [String(ind.NATIONALITY?.VALUE ?? ind.NATIONALITY)] : [],
      countries: [],
      programs: ind.UN_LIST_TYPE ? [String(ind.UN_LIST_TYPE)] : [],
      remarks: ind.COMMENTS1 ? String(ind.COMMENTS1).slice(0, 500) : null,
      source_url: SOURCES.un,
    });
    if (batch.length >= BATCH_SIZE) { await flushBatch(supabase, batch); count += batch.length; batch = []; }
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
    batch.push({
      source: "un",
      source_id: `un-e-${e.DATAID || e.REFERENCE_NUMBER || name}`,
      entity_type: "entity",
      name,
      aliases: aliases.slice(0, 20),
      dob_year: null,
      dob: null,
      nationalities: [],
      countries: [],
      programs: e.UN_LIST_TYPE ? [String(e.UN_LIST_TYPE)] : [],
      remarks: e.COMMENTS1 ? String(e.COMMENTS1).slice(0, 500) : null,
      source_url: SOURCES.un,
    });
    if (batch.length >= BATCH_SIZE) { await flushBatch(supabase, batch); count += batch.length; batch = []; }
  }
  if (batch.length) { await flushBatch(supabase, batch); count += batch.length; }
  return count;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  const only = url.searchParams.get("source"); // ofac|un|uk|pep
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const results: Record<string, unknown> = {};

  const run = async (name: string, fn: () => Promise<unknown>) => {
    if (only && only !== name) return;
    try { results[name] = await fn(); }
    catch (e) { console.error(`ingest ${name} failed`, e); results[name] = `error: ${(e as Error).message}`; }
  };

  // Default cron run skips PEPs (use ?source=pep&offset=N to chunk separately).
  await run("ofac", () => ingestOFAC(supabase));
  await run("un", () => ingestUN(supabase));
  await run("uk", () => ingestUK(supabase));
  if (only === "pep") {
    results["pep"] = await ingestPEP(supabase, offset, MAX_ROWS_PER_RUN);
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
