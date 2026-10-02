// Starts an ElevenLabs Alice conversation for the signed-in user.
// Returns a short-lived signed URL (WebSocket, used for text chat) and, for voice,
// a WebRTC conversation token, plus the dynamic variables the agent prompt expects.
// The ElevenLabs API key never leaves the server.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { EFINMONEY_ADMIN_KNOWLEDGE } from "../_shared/alice-knowledge.ts";

const ELEVEN_BASE = "https://api.elevenlabs.io/v1/convai/conversation";

async function elevenGet(path: string, apiKey: string) {
  const res = await fetch(`${ELEVEN_BASE}/${path}`, { headers: { "xi-api-key": apiKey } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.detail?.message || body?.detail || `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    const agentId = Deno.env.get("ELEVENLABS_AGENT_ID");
    if (!apiKey || !agentId) {
      return jsonResponse({ error: "Alice is not configured yet (missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID)." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const mode: "voice" | "text" = body?.mode === "voice" ? "voice" : "text";
    const requestedContext = body?.context === "admin" ? "admin" : "user";

    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      sb.from("user_roles").select("role").eq("user_id", user.id),
      sb.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    ]);
    const roles = new Set((roleRows || []).map((r: Record<string, unknown>) => String(r.role)));
    const isStaff = roles.has("admin") || roles.has("finance") || roles.has("compliance");
    const context = requestedContext === "admin" && isStaff ? "admin" : "user";

    const fullName = String(profile?.full_name || "").trim();
    const firstName = fullName ? fullName.split(/\s+/)[0] : (user.email?.split("@")[0] ?? "there");

    const q = `agent_id=${encodeURIComponent(agentId)}`;
    const [signed, token] = await Promise.all([
      elevenGet(`get-signed-url?${q}`, apiKey),
      mode === "voice" ? elevenGet(`token?${q}`, apiKey) : Promise.resolve(null),
    ]);

    return jsonResponse({
      signedUrl: signed?.signed_url ?? null,
      conversationToken: token?.token ?? null,
      context,
      userId: user.id,
      dynamicVariables: {
        user_name: firstName,
        alice_context: context,
        staff_notes: context === "admin" ? EFINMONEY_ADMIN_KNOWLEDGE : "",
        today: new Date().toISOString().slice(0, 10),
      },
    });
  } catch (err) {
    console.error("alice-agent-session error", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 502);
  }
});
