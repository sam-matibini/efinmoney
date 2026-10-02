import { supabase } from "@/integrations/supabase/client";

export type AliceContext = "user" | "admin";

export interface AliceAgentSession {
  signedUrl: string | null;
  conversationToken: string | null;
  userId: string;
  dynamicVariables: Record<string, string>;
}

/**
 * Asks `alice-agent-session` for a short-lived ElevenLabs credential. The user's own
 * access token is added as `secret__alice_token` so the agent's webhook tools run
 * as this user (ElevenLabs never sends `secret__` variables to the LLM).
 */
export async function fetchAliceAgentSession(context: AliceContext, mode: "text" | "voice"): Promise<AliceAgentSession> {
  const { data: auth } = await supabase.auth.getSession();
  const accessToken = auth.session?.access_token;
  if (!accessToken) throw new Error("Please sign in to talk to Alice.");

  const { data, error } = await supabase.functions.invoke("alice-agent-session", { body: { context, mode } });
  if (error) {
    // deno-lint-ignore no-explicit-any
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);

  return {
    signedUrl: data.signedUrl ?? null,
    conversationToken: data.conversationToken ?? null,
    userId: data.userId,
    dynamicVariables: { ...(data.dynamicVariables || {}), secret__alice_token: accessToken },
  };
}
