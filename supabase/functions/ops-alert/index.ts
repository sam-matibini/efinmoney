/**
 * Lightweight ops alert endpoint for top-up / collect failures.
 * Auth: service role or authenticated user (best-effort).
 */
import { notifyOpsAlert } from "../_shared/ops-alert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const subject = String(body.subject || "[Ops] Top-up / collect alert");
    const headline = String(body.headline || "Collect / top-up issue");
    const details = (body.details && typeof body.details === "object")
      ? body.details as Record<string, string | number | null | undefined>
      : { message: String(body.message || body.error || "unknown") };

    const result = await notifyOpsAlert({ subject, headline, details });
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      sent: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
