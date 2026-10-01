import { supabase } from "@/integrations/supabase/client";
import {
  geminiKeyCandidates,
  looksLikeGeminiApiKey,
  savedGeminiProblem,
  type SavedSystemApiRow,
} from "@/lib/aliceGeminiKey";

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

const SYSTEM = `You are Alice, the EfinMoney in-app assistant.
Only help with EfinMoney. Be concise and friendly.
Do not invent balances, fees, limits, or transaction details.
You are read-only and cannot send money or change an account.
Send money from the Send page. Nigeria payouts can go to mobile money or a bank account, depending on the recipient.
Add money from Top up. Exchange currency from the wallet. Verification is on the identity page.
If you are unsure, say so and point the user to the page or to support.`;

export { isMissingGeminiError, pickSavedGemini } from "@/lib/aliceGeminiKey";

type GeminiResult = { reply?: string; rejected?: boolean; error?: string };

function modelList(preferred: string): string[] {
  const models = [preferred, ...MODELS];
  return models.filter((model, index) => model && models.indexOf(model) === index);
}

async function callGemini(apiKey: string, model: string, contents: unknown[], system: string): Promise<GeminiResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 1024 },
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
  if (response.ok && text) return { reply: text };
  const providerMessage = String(body?.error?.message || body?.error?.status || "");
  const reason = String(body?.error?.details?.find((detail: { reason?: string }) => detail?.reason)?.reason || "");
  const rejected = /api key not valid|API_KEY_INVALID|permission denied|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_SERVICE_BLOCKED/i.test(
    `${providerMessage} ${reason}`,
  );
  if (rejected) return { rejected: true, error: providerMessage || "Gemini rejected the saved API key." };
  if (providerMessage && !/not found|not supported/i.test(providerMessage)) return { error: providerMessage };
  return { error: "Gemini did not answer." };
}

async function askDirect(candidates: { apiKey: string; model: string }[], contents: unknown[], system: string): Promise<string> {
  let lastError = "Gemini did not answer.";
  for (const saved of candidates) {
    for (const model of modelList(saved.model)) {
      const result = await callGemini(saved.apiKey, model, contents, system);
      if (result.reply) return result.reply;
      if (result.rejected) {
        lastError = looksLikeGeminiApiKey(saved.apiKey)
          ? "Google rejected the saved Gemini key. In Google AI Studio, create an API key with no website restriction, then save it on the Gemini card."
          : "The value saved on the Gemini card is not a Google API key. Copy the key from Google AI Studio — it starts with AIza — and save it again.";
        break;
      }
      if (result.error) lastError = result.error;
    }
  }
  throw new Error(lastError);
}

async function staffFacts(messages: { role: string; content: string }[]): Promise<string> {
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  if (!/settlement|reconcil/i.test(latest)) return "";
  const db = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        limit: (count: number) => Promise<{ data: { status?: string; variance_amount?: number }[] | null; error: { message?: string } | null }>;
      };
    };
  };
  const { data, error } = await db.from("settlement_reconciliations").select("status, variance_amount").limit(1000);
  if (error || !data) return "";
  const byStatus: Record<string, number> = {};
  let totalVariance = 0;
  for (const row of data) {
    const status = row.status || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
    totalVariance += Number(row.variance_amount || 0);
  }
  const summary = { total: data.length, by_status: byStatus, total_variance: Math.round(totalVariance * 100) / 100 };
  return `\nStaff settlement reconciliation data (use these figures only): ${JSON.stringify(summary)}`;
}

async function askThroughServer(
  messages: { role: string; content: string }[],
): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  let response: Response;
  try {
    response = await fetch("/api/alice-gemini", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages }),
    });
  } catch {
    return null;
  }
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (response.ok && typeof body?.reply === "string" && body.reply.trim()) return body.reply.trim();
  if (typeof body?.error === "string" && body.error.trim()) throw new Error(body.error);
  return null;
}

export async function askAliceWithSavedGemini(
  messages: { role: string; content: string }[],
): Promise<string> {
  const { data, error } = await supabase
    .from("integration_settings")
    .select("key, is_enabled, config")
    .like("key", "system_api:%");
  if (error) {
    if (/permission denied|row-level security/i.test(error.message)) {
      throw new Error("Alice cannot read the saved Gemini key from this account.");
    }
    throw new Error(error.message);
  }
  const rows = (data || []) as SavedSystemApiRow[];
  const problem = savedGeminiProblem(rows);
  if (problem) throw new Error(problem);
  const saved = geminiKeyCandidates(rows);
  const contents = messages
    .slice(-16)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content || "" }],
    }));
  while (contents.length && contents[0].role !== "user") contents.shift();
  const system = `${SYSTEM}${await staffFacts(messages)}`;

  try {
    return await askDirect(saved, contents, system);
  } catch (directError) {
    const serverReply = await askThroughServer(messages);
    if (serverReply) return serverReply;
    throw directError;
  }
}
