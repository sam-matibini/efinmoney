// Creates or updates the ElevenLabs Alice agent and its webhook tools from the code in
// _shared/alice-knowledge.ts and _shared/aliceTools.ts. Re-run after changing either.
// Auth: service role key only (Authorization: Bearer <service_role_key>).
// Body (optional): { agent_id?, create_new?, voice_id?, llm? }. Returns { agent_id, tool_ids }.
import { jsonResponse } from "../_shared/cors.ts";
import { EFINMONEY_KNOWLEDGE } from "../_shared/alice-knowledge.ts";
import {
  ALICE_AGENT_ID,
  ALICE_GUARDRAILS,
  ALICE_NAV_CLIENT_TOOL,
  ALICE_TOOLS,
  type AliceToolDef,
} from "../_shared/aliceTools.ts";

const API = "https://api.elevenlabs.io/v1/convai";
const DEFAULT_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2";
const DEFAULT_LLM = "gpt-5.4-mini";

// deno-lint-ignore no-explicit-any
type Any = any;

async function eleven(method: string, path: string, apiKey: string, body?: unknown): Promise<Any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json?.detail ?? json)}`);
  return json;
}

function toolConfig(def: AliceToolDef, supabaseUrl: string) {
  const query = def.params
    ? {
      properties: Object.fromEntries(
        Object.entries(def.params).map(([k, v]) => [k, { type: v.type, description: v.description }]),
      ),
      required: def.required ?? [],
    }
    : undefined;
  return {
    type: "webhook",
    name: def.name,
    description: def.description,
    response_timeout_secs: 20,
    api_schema: {
      url: `${supabaseUrl}/functions/v1/alice-tools/${def.name}`,
      method: "GET",
      request_headers: { "x-alice-token": { variable_name: "secret__alice_token" } },
      ...(query ? { query_params_schema: query } : {}),
    },
  };
}

const SYSTEM_PROMPT = [
  EFINMONEY_KNOWLEDGE,
  "{{staff_notes}}",
  ALICE_GUARDRAILS,
  "",
  "Conversation context: {{alice_context}}. The user's first name is {{user_name}}. Today's date is {{today}}.",
  "Only use staff-only tools when the conversation context is admin.",
].join("\n");

Deno.serve(async (req) => {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!serviceKey || bearer !== serviceKey) return jsonResponse({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) return jsonResponse({ error: "Missing ELEVENLABS_API_KEY secret" }, 500);

    const body = await req.json().catch(() => ({}));
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const existingAgentId: string = body?.agent_id || (body?.create_new ? "" : ALICE_AGENT_ID);

    const listed = await eleven("GET", "/tools", apiKey);
    const existingTools: Any[] = listed?.tools || [];
    const toolIds: string[] = [];
    const configs = [...ALICE_TOOLS.map((def) => toolConfig(def, supabaseUrl)), ALICE_NAV_CLIENT_TOOL];
    for (const config of configs) {
      const found = existingTools.find((t) => t?.tool_config?.name === config.name);
      if (found?.id) {
        await eleven("PATCH", `/tools/${found.id}`, apiKey, { tool_config: config });
        toolIds.push(found.id);
      } else {
        const created = await eleven("POST", "/tools", apiKey, { tool_config: config });
        toolIds.push(created.id);
      }
    }

    const agentBody = {
      name: "Alice · EfinMoney",
      conversation_config: {
        agent: {
          first_message: "Hi {{user_name}}, this is Alice from EfinMoney. How can I help you today?",
          language: "en",
          prompt: { prompt: SYSTEM_PROMPT, llm: body?.llm || DEFAULT_LLM, tool_ids: toolIds },
          dynamic_variables: {
            dynamic_variable_placeholders: {
              user_name: "there",
              alice_context: "user",
              staff_notes: "",
              today: new Date().toISOString().slice(0, 10),
            },
          },
        },
        tts: { voice_id: body?.voice_id || DEFAULT_VOICE_ID },
      },
      platform_settings: {
        auth: { enable_auth: true },
        overrides: {
          conversation_config_override: {
            agent: { first_message: true },
            conversation: { text_only: true },
          },
        },
      },
    };

    let agentId = existingAgentId;
    if (agentId) {
      await eleven("PATCH", `/agents/${agentId}`, apiKey, agentBody);
    } else {
      const created = await eleven("POST", "/agents/create", apiKey, agentBody);
      agentId = created.agent_id;
    }

    return jsonResponse({ agent_id: agentId, tool_ids: toolIds, updated: Boolean(existingAgentId) });
  } catch (err) {
    console.error("alice-agent-setup error", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
