// Alice tools shared by the ElevenLabs agent webhook (alice-tools) and agent setup
// (alice-agent-setup). Tools run with the caller's own Supabase JWT, so RLS scopes
// every query to that user; staff-only tools also check user_roles server-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// deno-lint-ignore no-explicit-any
type Any = any;

// Not a secret: the agent requires a server-minted signed URL/token to connect.
export const ALICE_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID") || "agent_1601m3xzq92zer3tt5w1d1m703h4";

export const ALICE_GUARDRAILS = `
You are Alice, the EfinMoney in-app assistant. Rules:
- Only help with EfinMoney. Politely decline unrelated topics.
- Be concise, friendly, and clear. In voice calls keep answers to two or three short
  sentences and never read out markdown, bullet symbols, or long IDs.
- NEVER invent balances, fees, limits, dates, or transaction details. Only state
  figures that came from a tool result or the knowledge above. If unsure, say so and
  point the user to the relevant page or to support.
- You are READ-ONLY. You cannot send money, convert currency, change settings, or
  approve anything. If asked to perform an action, explain you can't do it yet and
  point to the correct page (or support for account changes).
- Do not give financial, tax, or legal advice.
- When a question is about the user's own account (balance, transactions, KYC), use
  the available tools to fetch real data before answering.
- Personal KYC (levels 1-3) and business verification (KYB) are separate. Never tell a
  personal user that business verification is a KYC level.
- If you cannot resolve the user's issue after trying (missing info, account action
  only staff can do, or you are unsure), clearly say you can't fully fix it and
  suggest they talk to a human via Talk to support. Do not invent a workaround.`;

export type AliceToolDef = {
  name: string;
  description: string;
  staffOnly?: boolean;
  params?: Record<string, { type: "string" | "number"; description: string }>;
  required?: string[];
};

export const ALICE_TOOLS: AliceToolDef[] = [
  { name: "get_my_balances", description: "Get the signed-in user's wallet balances per currency." },
  {
    name: "get_my_recent_transactions",
    description: "Get the signed-in user's most recent wallet transactions.",
    params: { limit: { type: "number", description: "How many to return (max 20). Default 10." } },
  },
  { name: "get_my_kyc_status", description: "Get the signed-in user's personal KYC level/status, or KYB status for business accounts." },
  { name: "get_pending_kyc_count", description: "Staff only: count KYC verifications awaiting review.", staffOnly: true },
  { name: "get_settlement_summary", description: "Staff only: settlement reconciliation rows by status plus total variance.", staffOnly: true },
  {
    name: "lookup_user_by_email",
    description: "Staff only: find users whose email matches a search string.",
    staffOnly: true,
    params: { email: { type: "string", description: "Full or partial email address to search for." } },
    required: ["email"],
  },
  { name: "get_open_incidents_count", description: "Staff only: count operational incidents that are not resolved/closed.", staffOnly: true },
];

export type AliceCaller = { sb: Any; userId: string; email: string | null; isStaff: boolean };

/** Validates a Supabase access token and returns an RLS-scoped client for that user. */
export async function resolveAliceCaller(accessToken: string): Promise<AliceCaller | null> {
  if (!accessToken) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await sb.auth.getUser(accessToken);
  if (!user) return null;
  const { data: roleRows } = await sb.from("user_roles").select("role").eq("user_id", user.id);
  const roles = new Set((roleRows || []).map((r: Record<string, unknown>) => String(r.role)));
  const isStaff = roles.has("admin") || roles.has("finance") || roles.has("compliance");
  return { sb, userId: user.id, email: user.email ?? null, isStaff };
}

export async function runAliceTool(name: string, args: Record<string, unknown>, caller: AliceCaller): Promise<unknown> {
  const { sb, userId, isStaff } = caller;
  const def = ALICE_TOOLS.find((t) => t.name === name);
  if (!def) return { error: `unknown tool ${name}` };
  if (def.staffOnly && !isStaff) return { error: "not authorized" };

  switch (name) {
    case "get_my_balances": {
      const { data, error } = await sb.rpc("get_user_wallet_balances", { p_user_id: userId });
      if (error) return { error: error.message };
      return (data || []).map((w: Record<string, unknown>) => ({ currency: w.currency_code, balance: w.balance, is_default: w.is_default }));
    }
    case "get_my_recent_transactions": {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
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
      const [{ data, error }, { data: business }] = await Promise.all([
        sb.from("profiles").select("kyc_status, kyc_tier").eq("user_id", userId).maybeSingle(),
        sb.from("business_profiles").select("kyb_status, legal_name").eq("owner_user_id", userId).maybeSingle(),
      ]);
      if (error) return { error: error.message };
      if (business) {
        return {
          account_kind: "business",
          kyb_status: business.kyb_status,
          legal_name: business.legal_name,
          personal_kyc_required: false,
          note: "Business accounts use KYB, not personal KYC.",
          kyc_status: data?.kyc_status ?? "not_required",
          kyc_tier: data?.kyc_tier ?? null,
        };
      }
      return { account_kind: "personal", ...(data || { kyc_status: "unknown", kyc_tier: "unknown" }) };
    }
    case "get_pending_kyc_count": {
      const { count, error } = await sb.from("kyc_verifications").select("id", { count: "exact", head: true }).eq("verification_status", "pending_review");
      return error ? { error: error.message } : { pending_review: count || 0 };
    }
    case "get_settlement_summary": {
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
      const email = String(args.email || "").trim();
      if (!email) return { error: "email required" };
      const { data, error } = await sb.from("profiles").select("full_name, email, country_code, kyc_status, kyc_tier, account_number").ilike("email", `%${email}%`).limit(5);
      return error ? { error: error.message } : (data || []);
    }
    case "get_open_incidents_count": {
      const { data, error } = await sb.from("incidents").select("status").limit(500);
      if (error) return { error: error.message };
      const open = (data || []).filter((i: Record<string, unknown>) => !["resolved", "closed"].includes(String(i.status))).length;
      return { open };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}
