// Webhook endpoint for the ElevenLabs Alice agent's server tools.
// URL: /functions/v1/alice-tools/<tool_name>?<params>
// The agent forwards the signed-in user's Supabase access token (secret dynamic
// variable, never shown to the LLM) in `x-alice-token`; every tool runs as that user.
import { jsonResponse } from "../_shared/cors.ts";
import { resolveAliceCaller, runAliceTool } from "../_shared/aliceTools.ts";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const toolName = url.pathname.split("/").filter(Boolean).pop() || "";

    const token = (req.headers.get("x-alice-token") || "").replace(/^Bearer\s+/i, "").trim();
    const caller = await resolveAliceCaller(token);
    if (!caller) {
      return jsonResponse({ error: "Not signed in. Ask the user to sign in to EfinMoney and try again." }, 401);
    }

    const args: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body === "object") Object.assign(args, body);
    }

    const result = await runAliceTool(toolName, args, caller);
    return jsonResponse({ result });
  } catch (err) {
    console.error("alice-tools error", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
