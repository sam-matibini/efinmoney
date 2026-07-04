// Alice AI — EfinMoney assistant. Answers product questions and, for the signed-in
// caller, read-only questions about their own data (admins get operational read tools).
// Calls the Anthropic Messages API directly (ANTHROPIC_API_KEY secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { EFINMONEY_KNOWLEDGE, EFINMONEY_ADMIN_KNOWLEDGE } from "../_shared/alice-knowledge.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5"; // latest, capable, good cost for chat
const MAX_TOKENS = 1024;
const MAX_TOOL_ITERATIONS = 4;

// deno-lint-ignore no-explicit-any
type Any = any;

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

/* ── Anthropic tool schemas ── */
const USER_TOOLS = [
  { name: "get_my_balances", description: "Get the signed-in user's wallet balances per currency.", input_schema: { type: "object", properties: {} } },
  { name: "get_my_recent_transactions", description: "Get the signed-in user's most recent wallet transactions.", input_schema: { type: "object", properties: { limit: { type: "number", description: "How many to return (max 20)." } } } },
  { name: "get_my_kyc_status", description: "Get the signed-in user's KYC verification status and tier.", input_schema: { type: "object", properties: {} } },
];
const ADMIN_TOOLS = [
  { name: "get_pending_kyc_count", description: "Count KYC verifications awaiting review.", input_schema: { type: "object", properties: {} } },
  { name: "get_settlement_summary", description: "Summary of settlement reconciliation rows by status plus total variance.", input_schema: { type: "object", properties: {} } },
  { name: "lookup_user_by_email", description: "Find users whose email matches a search string.", input_schema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } },
  { name: "get_open_incidents_count", description: "Count operational incidents that are not resolved/closed.", input_schema: { type: "object", properties: {} } },
];

async function runTool(name: string, args: Record<string, unknown>, sb: Any, userId: string, isStaff: boolean): Promise<unknown> {
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

async function callAnthropic(apiKey: string, system: string, messages: Any[], tools: Any[]) {
  return await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages, tools }),
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

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return jsonResponse({ error: "Alice is not configured yet (missing ANTHROPIC_API_KEY)." }, 500);

    const body = await req.json().catch(() => ({}));
    const history: { role: string; content: string }[] = Array.isArray(body?.messages) ? body.messages : [];
    const requestedContext: string = body?.context === "admin" ? "admin" : "user";
    if (history.length === 0) return jsonResponse({ error: "messages required" }, 400);

    // Server is the source of truth for privilege — a user cannot self-elevate.
    const { data: roleRows } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    const roles = new Set((roleRows || []).map((r: Record<string, unknown>) => String(r.role)));
    const isStaff = roles.has("admin") || roles.has("finance") || roles.has("compliance");
    const effectiveContext = requestedContext === "admin" && isStaff ? "admin" : "user";

    const system = [
      EFINMONEY_KNOWLEDGE,
      effectiveContext === "admin" ? EFINMONEY_ADMIN_KNOWLEDGE : "",
      GUARDRAILS,
      `\nToday's date is ${new Date().toISOString().slice(0, 10)}.`,
    ].filter(Boolean).join("\n");

    const tools = effectiveContext === "admin" ? [...USER_TOOLS, ...ADMIN_TOOLS] : USER_TOOLS;

    // Build Anthropic messages: only user/assistant text, must start with 'user'.
    const messages: Any[] = history
      .slice(-16)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content ?? "" }));
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (messages.length === 0) return jsonResponse({ error: "messages required" }, 400);

    const toolsUsed: string[] = [];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const res = await callAnthropic(apiKey, system, messages, tools);
      if (res.status === 429) return jsonResponse({ error: "Alice is busy, please try again in a moment." }, 429);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody?.error?.message || `HTTP ${res.status}`;
        console.error("anthropic error", res.status, detail);
        return jsonResponse({ error: `AI error: ${detail}` }, 502);
      }

      const json = await res.json();
      const content: Any[] = json?.content || [];

      if (json?.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content }); // echo assistant turn incl. tool_use blocks
        const results: Any[] = [];
        for (const block of content) {
          if (block?.type !== "tool_use") continue;
          toolsUsed.push(block.name);
          const result = await runTool(block.name, block.input || {}, sb, user.id, isStaff);
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const text = content.filter((b) => b?.type === "text").map((b) => b.text).join("\n").trim();
      return jsonResponse({ reply: text, tools_used: toolsUsed, context: effectiveContext });
    }

    // Ran out of tool iterations — ask for a final answer with no more tools.
    const finalRes = await callAnthropic(apiKey, system, messages, []);
    if (!finalRes.ok) return jsonResponse({ error: "AI error (final)" }, 502);
    const finalJson = await finalRes.json();
    const text = (finalJson?.content || []).filter((b: Any) => b?.type === "text").map((b: Any) => b.text).join("\n").trim();
    return jsonResponse({ reply: text, tools_used: toolsUsed, context: effectiveContext });
  } catch (err) {
    console.error("alice-chat error", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
