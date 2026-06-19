// Validate bill customer ID — GET /v3/bill-items/{item_code}/validate
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const itemCode = String(body?.itemCode || body?.item_code || "").trim();
    const billerCode = String(body?.billerCode || body?.code || "").trim();
    const customer = String(body?.customer || body?.customerIdentifier || "").trim();
    if (!itemCode || !billerCode || !customer) {
      return jsonResponse({ error: "itemCode, billerCode and customer are required" }, 400);
    }

    const qs = new URLSearchParams({ code: billerCode, customer });
    const { ok, json } = await flwV3Fetch(
      `/bill-items/${encodeURIComponent(itemCode)}/validate?${qs}`,
      { method: "GET", timeoutMs: 15_000 },
    );

    if (!ok) {
      return jsonResponse({
        valid: false,
        error: json?.message || "Validation failed",
        details: json,
      }, 400);
    }

    return jsonResponse({
      valid: true,
      data: json?.data ?? json,
      message: json?.message,
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});
