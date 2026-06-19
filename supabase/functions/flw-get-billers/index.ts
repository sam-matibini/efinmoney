// Flutterwave bill categories & billers — GET /v3/top-bill-categories, /v3/bills/{cat}/billers, /v3/bill-categories
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function fetchCategories(country: string) {
  const { ok, json } = await flwV3Fetch(`/top-bill-categories?country=${country}`, { method: "GET", timeoutMs: 12_000 });
  if (ok && Array.isArray(json?.data) && json.data.length) {
    return json.data.map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name || c.description,
      code: String(c.code || "").toUpperCase(),
      description: c.description || c.name,
      country_code: c.country_code || country,
    }));
  }

  const { ok: ok2, json: json2 } = await flwV3Fetch("/bill-categories", { method: "GET", timeoutMs: 15_000 });
  if (!ok2 || !Array.isArray(json2?.data)) return [];

  const seen = new Set<string>();
  const categories: Record<string, unknown>[] = [];
  for (const b of json2.data as Record<string, unknown>[]) {
    if (String(b.country || "").toUpperCase() !== country) continue;
    const code = String(b.biller_name || b.biller_code || "").toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    categories.push({
      id: categories.length + 1,
      name: b.name || code,
      code,
      description: b.short_name || b.name || code,
      country_code: country,
    });
  }
  return categories;
}

async function fetchBillers(country: string, category: string) {
  const cat = category.toUpperCase();
  const { ok, json } = await flwV3Fetch(
    `/bills/${encodeURIComponent(cat)}/billers?country=${country}`,
    { method: "GET", timeoutMs: 12_000 },
  );
  if (ok && Array.isArray(json?.data) && json.data.length) return json.data;

  const { ok: ok2, json: json2 } = await flwV3Fetch("/bill-categories", { method: "GET", timeoutMs: 15_000 });
  if (!ok2 || !Array.isArray(json2?.data)) return [];

  return (json2.data as Record<string, unknown>[]).filter((b) => {
    if (String(b.country || "").toUpperCase() !== country) return false;
    const billerName = String(b.biller_name || "").toUpperCase();
    const isAirtime = b.is_airtime === true;
    if (cat === "AIRTIME") return isAirtime || billerName.includes("AIRTIME");
    if (cat.includes("DATA")) return billerName.includes("DATA");
    if (cat.includes("CABLE") || cat === "DSTV" || cat === "GOTV") {
      return billerName.includes("CABLE") || billerName.includes("DSTV") || billerName.includes("GOTV") || billerName.includes("TV");
    }
    if (cat.includes("UTIL") || cat.includes("ELECT") || cat.includes("POWER")) {
      return billerName.includes("ELECT") || billerName.includes("PREPAID") || billerName.includes("POSTPAID")
        || billerName.includes("POWER") || billerName.includes("EKEDC") || billerName.includes("UTILITY");
    }
    if (cat.includes("WATER")) return billerName.includes("WATER");
    return billerName === cat || billerName.includes(cat) || cat.includes(billerName);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  try {
    const user = await requireUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const country = (url.searchParams.get("country") || "NG").toUpperCase();
    const category = url.searchParams.get("category");
    const list = url.searchParams.get("list");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cacheCategory = list === "categories" ? "__categories__" : (category || null);

    let cQ = admin.from("flw_billers_cache").select("billers, fetched_at").eq("country", country);
    cQ = cacheCategory === null ? cQ.is("category", null) : cQ.eq("category", cacheCategory);
    const { data: cached } = await cQ.maybeSingle();
    const fresh = cached && (Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600 * 1000);

    if (list === "categories") {
      if (fresh && Array.isArray(cached?.billers)) {
        return jsonResponse({ categories: cached.billers, cached: true });
      }
      const categories = await fetchCategories(country);
      if (categories.length) {
        await admin.from("flw_billers_cache").upsert(
          { country, category: "__categories__", billers: categories, fetched_at: new Date().toISOString() },
          { onConflict: "country,category" },
        );
      }
      return jsonResponse({
        categories,
        cached: false,
        supported: categories.length > 0,
        message: categories.length === 0 ? "Bill payments are not available for this country yet." : undefined,
      });
    }

    if (!category) return jsonResponse({ error: "category is required for billers list" }, 400);

    if (fresh && Array.isArray(cached?.billers)) {
      return jsonResponse({ billers: cached.billers, cached: true });
    }

    const billers = await fetchBillers(country, category);
    if (billers.length === 0 && cached?.billers) {
      return jsonResponse({ billers: cached.billers, cached: true, stale: true });
    }

    if (billers.length) {
      await admin.from("flw_billers_cache").upsert(
        { country, category, billers, fetched_at: new Date().toISOString() },
        { onConflict: "country,category" },
      );
    }

    return jsonResponse({ billers, cached: false });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});
