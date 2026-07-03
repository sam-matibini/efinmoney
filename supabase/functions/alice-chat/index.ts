// Alice AI — EfinMoney assistant. Answers product questions and, for the signed-in
// caller, read-only questions about their own data (admins get operational read tools).
// Reuses the Lovable AI Gateway (LOVABLE_API_KEY), same as scan-purchase-bill.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { EFINMONEY_KNOWLEDGE, EFINMONEY_ADMIN_KNOWLEDGE } from "../_shared/alice-knowledge.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PRIMARY_MODEL = "anthropic/claude-sonnet-4-5"; // Claude via gateway (per product choice)
const FALLBACK_MODEL = "google/gemini-3-flash-preview"; // known-good if the gateway rejects the model id
const MAX_TOOL_ITERATIONS = 4;

type ChatMsg = { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string };

const GUARDRAILS = `
You are Alice, the EfinMoney in-app assistant. Rules:
- Only help with EfinMoney. Politely decline unrelated topics.
- Be concise, friendly, and clear. Use short paragraphs or bullet points.
- NEVER invent balances, fees, limits, dates, or transaction details. Only state
  figures that came from a tool result or the knowledge above. If unsure, say so and
  point the user to the relevant page or to support.
- You are READ-ONLY. You cannot send money, convert currency, change settings, or
  approve anything. If asked to perform an action, explain you can't do it yet and
  point to the correct page (or support for account changes).
- Do not give financial, tax, or legal advice.
- When a question is about the user's own account (balance, transactions, KYC), use
  the available tools to fetch real data before answering.`;

/* ── tool schemas ── */
const USER_TOOLS = [
  { type: "function", function: { name: "get_my_balances", description: "Get the signed-in user's wallet balances per currency.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_my_recent_transactions", description: "Get the signed-in user's most recent wallet transactions.", parameters: { type: "object", properties: { limit: { type: "number", description: "How many to return (max 20)." } }, additionalProperties: false } } },
  { type: "function", function: { name: "get_my_kyc_status", description: "Get the signed-in user's KYC verification status and tier.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
];
const ADMIN_TOOLS = [
  { type: "function", function: { name: "get_pending_kyc_count", description: "Count KYC verifications awaiting review.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "get_settlement_summary", description: "Summary of settlement reconciliation rows by status plus total variance.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "lookup_user_by_email", description: "Find users whose email matches a search string.", parameters: { type: "object", properties: { email: { type: "string" } }, required: ["email"], additionalProperties: false } } },
  { type: "function", function: { name: "get_open_incidents_count", description: "Count operational incidents that are not resolved/closed.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
];

// deno-lint-ignore no-explicit-any
type SB = any;

async function runTool(name: string, args: Record<string, unknown>, sb: SB, userId: string, isStaff: boolean): Promise<unknown> {
  switch (name) {
    case "get_my_balances": {
      const { data, error } = await sb.rpc("get_user_wallet_balances", { p_user_id: userId });
      if (error) return { error: error.message };
      return (data || []).map((w: Record<string, unknown>) => ({ currency: w.currency_code, balance: w.balance, is_default: w.is_default }));
    }
    case "get_my_recent_transactions": {
      const limit = Math.min(Number(args.limit) || 10, 20);
      const { data, error } = await sb
        .from("ledger_entries")
        .select("currency_code, debit_amount, credit_amount, description, reference_type, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      return (data || []).map((e: Record<string, unknown>) => ({
        date: e.created_at,
        type: e.reference_type,
        description: e.description,
        currency: e.currency_code,
        direction: Number(e.credit_amount) > 0 ? "in" : "out",
        amount: Number(e.credit_amount) > 0 ? e.credit_amount : e.debit_amount,
      }));
    }
    case "get_my_kyc_status": {
      const { data, error } = await sb.from("profiles").select("kyc_status, kyc_tier").eq("user_id", userId).maybeSingle();
      if (error) return { error: error.message };
      return data || { kyc_status: "unknown", kyc_tier: "unknown" };
    }
    case "get_pending_kyc_count": {
      if (!isStaff) return { error: "not authorized" };
      const { count, error } = await sb.from("kyc_verifications").select("id", { count: "exact", head: true }).eq("verification_status", "pending_review");
      return error ? { error: error.message } : { pending_review: count || 0 };
    }
    case "get_settlement_summary": {
      if (!isStaff) return { error: "not authorized" };
      const { data, error } = await sb.from("settlement_reconciliations").select("status, variance_amount").limit(1000);
      if (error) return { error: error.message };
      const byStatus: Record<string, number> = {};
      let totalVariance = 0;
      for (const r of data || []) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        totalVariance += Number(r.variance_amount || 0);
      }
      return { total: (data || []).length, by_status: byStatus, total_variance: Math.round(totalVariance * 100) / 100 };
    }
    case "lookup_user_by_email": {
      if (!isStaff) return { error: "not authorized" };
      const email = String(args.email || "").trim();
      if (!email) return { error: "email required" };
      const { data, error } = await sb.from("profiles").select("full_name, email, country_code, kyc_status, kyc_tier, account_number").ilike("email", `%${email}%`).limit(5);
      return error ? { error: error.message } : (data || []);
    }
    case "get_open_incidents_count": {
      if (!isStaff) return { error: "not authorized" };
      const { data, error } = await sb.from("incidents").select("status").limit(500);
      if (error) return { error: error.message };
      const open = (data || []).filter((i: Record<string, unknown>) => !["resolved", "closed"].includes(String(i.status))).length;
      return { open };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

async function callGateway(apiKey: string, model: string, messages: ChatMsg[], tools: unknown[]) {
  return await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return jsonResponse({ error: "AI gateway not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const history: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];
    const requestedContext: string = body?.context === "admin" ? "admin" : "user";
    if (history.length === 0) return jsonResponse({ error: "messages required" }, 400);

    // Server is the source of truth for privilege — a user cannot self-elevate.
    const { data: roleRows } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    const roles = new Set((roleRows || []).map((r: Record<string, unknown>) => String(r.role)));
    const isStaff = roles.has("admin") || roles.has("finance") || roles.has("compliance");
    const effectiveContext = requestedContext === "admin" && isStaff ? "admin" : "user";

    const systemPrompt = [
      EFINMONEY_KNOWLEDGE,
      effectiveContext === "admin" ? EFINMONEY_ADMIN_KNOWLEDGE : "",
      GUARDRAILS,
      `\nToday's date is ${new Date().toISOString().slice(0, 10)}.`,
    ].filter(Boolean).join("\n");

    const tools = effectiveContext === "admin" ? [...USER_TOOLS, ...ADMIN_TOOLS] : USER_TOOLS;

    // Keep only role/content/tool fields from client history; cap length.
    const trimmed = history.slice(-16).map((m) => ({ role: m.role, content: m.content ?? "" }));
    const messages: ChatMsg[] = [{ role: "system", content: systemPrompt }, ...trimmed];

    const toolsUsed: string[] = [];
    let model = PRIMARY_MODEL;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      let res = await callGateway(apiKey, model, messages, tools);
      // If the gateway rejects the Claude model id, fall back once to the known-good model.
      if (!res.ok && (res.status === 400 || res.status === 404) && model === PRIMARY_MODEL) {
        model = FALLBACK_MODEL;
        res = await callGateway(apiKey, model, messages, tools);
      }
      if (res.status === 429) return jsonResponse({ error: "Alice is busy, please try again in a moment." }, 429);
      if (res.status === 402) return jsonResponse({ error: "AI credits exhausted. Add credits in workspace billing." }, 402);
      if (!res.ok) {
        const text = await res.text();
        console.error("gateway error", res.status, text);
        return jsonResponse({ error: `AI gateway error (${res.status})` }, 502);
      }

      const json = await res.json();
      const msg = json?.choices?.[0]?.message;
      const calls = msg?.tool_calls;

      if (!calls || calls.length === 0) {
        return jsonResponse({ reply: msg?.content ?? "", tools_used: toolsUsed, context: effectiveContext });
      }

      // Execute each requested tool and feed results back.
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      for (const call of calls) {
        const name = call?.function?.name;
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(call?.function?.arguments || "{}"); } catch { /* ignore */ }
        toolsUsed.push(name);
        const result = await runTool(name, parsedArgs, sb, user.id, isStaff);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    // Ran out of tool iterations — ask for a final answer with no more tools.
    const finalRes = await callGateway(apiKey, model, messages, []);
    if (!finalRes.ok) return jsonResponse({ error: "AI gateway error" }, 502);
    const finalJson = await finalRes.json();
    return jsonResponse({ reply: finalJson?.choices?.[0]?.message?.content ?? "", tools_used: toolsUsed, context: effectiveContext });
  } catch (err) {
    console.error("alice-chat error", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
