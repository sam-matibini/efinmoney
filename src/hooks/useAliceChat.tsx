import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AliceRole = "user" | "assistant";
export interface AliceMessage {
  role: AliceRole;
  content: string;
  pending?: boolean;
}
export interface AliceConversationSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

type Context = "user" | "admin";

/**
 * Alice chat state for one widget instance. Sends the running thread to the
 * `alice-chat` edge function (which enforces role + RLS server-side) and
 * persists messages to the RLS-scoped alice_* tables so history can be revisited.
 */
export const useAliceChat = (context: Context) => {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<AliceMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  // alice_* tables aren't in generated Supabase types yet.
  // deno-lint-ignore no-explicit-any
  const db = supabase as any;

  const conversationsQuery = useQuery({
    queryKey: ["alice-conversations", context],
    queryFn: async (): Promise<AliceConversationSummary[]> => {
      const { data, error } = await db
        .from("alice_conversations")
        .select("id, title, updated_at")
        .eq("context", context)
        .order("updated_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as AliceConversationSummary[];
    },
  });

  const newChat = useCallback(() => {
    conversationIdRef.current = null;
    setMessages([]);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const { data, error } = await db
      .from("alice_messages")
      .select("role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (error) return;
    conversationIdRef.current = id;
    setMessages((data || []).map((m) => ({ role: m.role as AliceRole, content: m.content })));
  }, []);

  const send = useCallback(async (text: string): Promise<string | null> => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return null;

    const userMsg: AliceMessage = { role: "user", content: trimmed };
    const thread = [...messages, userMsg];
    setMessages([...thread, { role: "assistant", content: "", pending: true }]);
    setIsSending(true);

    try {
      // Ensure a conversation row exists (RLS: user_id defaults to auth.uid()).
      if (!conversationIdRef.current) {
        const { data: uinfo } = await supabase.auth.getUser();
        const uid = uinfo.user?.id;
        const { data: conv, error: convErr } = await db
          .from("alice_conversations")
          .insert({ user_id: uid, context, title: trimmed.slice(0, 60) })
          .select("id")
          .single();
        if (convErr) throw convErr;
        conversationIdRef.current = conv.id;
      }
      const conversationId = conversationIdRef.current;

      await db.from("alice_messages").insert({ conversation_id: conversationId, role: "user", content: trimmed });

      const { data, error } = await supabase.functions.invoke("alice-chat", {
        body: { messages: thread.map((m) => ({ role: m.role, content: m.content })), context },
      });
      if (error) throw error;
      const reply: string = data?.reply || data?.error || "Sorry, I couldn't answer that. Please try again.";

      await db.from("alice_messages").insert({ conversation_id: conversationId, role: "assistant", content: reply });
      await db.from("alice_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

      setMessages([...thread, { role: "assistant", content: reply }]);
      qc.invalidateQueries({ queryKey: ["alice-conversations", context] });
      return reply;
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Something went wrong.";
      // Supabase FunctionsHttpError hides the body — read it for the real reason.
      // deno-lint-ignore no-explicit-any
      const ctx = (err as any)?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const b = await ctx.json();
          if (b?.error) msg = b.error;
        } catch { /* ignore */ }
      }
      const fail = `⚠️ ${msg}`;
      setMessages([...thread, { role: "assistant", content: fail }]);
      return fail;
    } finally {
      setIsSending(false);
    }
  }, [messages, isSending, context, qc]);

  return {
    messages,
    isSending,
    send,
    newChat,
    loadConversation,
    conversations: conversationsQuery.data || [],
  };
};
