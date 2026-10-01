import { supabase } from "@/integrations/supabase/client";
import { pickSavedGemini, type SavedSystemApiRow } from "@/lib/aliceGeminiKey";

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

const SYSTEM = `You are Alice, the EfinMoney in-app assistant.
Only help with EfinMoney. Be concise and friendly.
Do not invent balances, fees, limits, or transaction details.
You are read-only and cannot send money or change an account.
Send money from the Send page. Nigeria payouts can go to mobile money or a bank account, depending on the recipient.
Add money from Top up. Exchange currency from the wallet. Verification is on the identity page.
If you are unsure, say so and point the user to the page or to support.`;

export { isMissingGeminiError, pickSavedGemini } from "@/lib/aliceGeminiKey";

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
  const saved = pickSavedGemini((data || []) as SavedSystemApiRow[]);
  if (!saved) {
    throw new Error("Save the Gemini API key on the Gemini card in System API, then try Alice again.");
  }

  const contents = messages
    .slice(-16)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content || "" }],
    }));
  while (contents.length && contents[0].role !== "user") contents.shift();
  const models = [saved.model, ...MODELS.filter((model) => model !== saved.model)];
  let lastError = "Gemini did not answer.";
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": saved.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { maxOutputTokens: 1024 },
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    const text = body?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
    if (response.ok && text) return text;
    const providerMessage = body?.error?.message || body?.error?.status || "";
    if (/api key not valid|API_KEY_INVALID|permission denied/i.test(String(providerMessage))) {
      throw new Error("Gemini rejected the saved API key. Check the key on the Gemini card and save it again.");
    }
    if (providerMessage && !/not found|not supported/i.test(String(providerMessage))) {
      lastError = String(providerMessage);
    }
  }
  throw new Error(lastError);
}
