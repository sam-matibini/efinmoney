import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Conversation, type TextConversation } from "@elevenlabs/client";
import { supabase } from "@/integrations/supabase/client";
import { syncAliceTurnToSupport } from "@/lib/syncAliceToSupport";
import { fetchAliceAgentSession } from "@/lib/aliceAgent";
import { delegateClientTools, type AliceClientTools } from "@/lib/aliceNavigation";

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

const REPLY_TIMEOUT_MS = 45_000;

/**
 * Alice chat state for one widget instance. Text runs on a text-only ElevenLabs
 * agent session (tools enforce role + RLS server-side via `alice-tools`) and every
 * turn is persisted to the RLS-scoped alice_* tables so history can be revisited.
 */
export const useAliceChat = (context: Context, clientTools?: AliceClientTools) => {
  const qc = useQueryClient();
  const toolsRef = useRef(clientTools);
  useEffect(() => {
    toolsRef.current = clientTools;
  }, [clientTools]);
  const [messages, setMessages] = useState<AliceMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const convCreateRef = useRef<Promise<string> | null>(null);
  const messagesRef = useRef<AliceMessage[]>([]);
  const sessionRef = useRef<TextConversation | null>(null);
  const sessionStartRef = useRef<Promise<TextConversation> | null>(null);
  const pendingReplyRef = useRef<((text: string) => void) | null>(null);
  // alice_* tables aren't in generated Supabase types yet.
  // deno-lint-ignore no-explicit-any
  const db = supabase as any;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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

  const endSession = useCallback(() => {
    const s = sessionRef.current;
    sessionRef.current = null;
    sessionStartRef.current = null;
    pendingReplyRef.current = null;
    if (s) void s.endSession().catch(() => {});
  }, []);

  useEffect(() => endSession, [endSession]);

  /** Creates the alice_conversations row once, even if several turns race. */
  const ensureConversation = useCallback(async (title: string): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    if (!convCreateRef.current) {
      convCreateRef.current = (async () => {
        const { data: uinfo } = await supabase.auth.getUser();
        const { data: conv, error } = await db
          .from("alice_conversations")
          .insert({ user_id: uinfo.user?.id, context, title: title.slice(0, 60) })
          .select("id")
          .single();
        if (error) throw error;
        conversationIdRef.current = conv.id;
        setConversationId(conv.id);
        return conv.id as string;
      })().finally(() => {
        convCreateRef.current = null;
      });
    }
    return convCreateRef.current;
  }, [context]);

  const persist = useCallback(async (role: AliceRole, content: string, title: string) => {
    const convId = await ensureConversation(title);
    await db.from("alice_messages").insert({ conversation_id: convId, role, content });
    await db.from("alice_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    return convId;
  }, [ensureConversation]);

  /** Agent messages that arrive after the turn's first reply (e.g. after a tool call). */
  const appendFollowUp = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content: text }]);
    const title = messagesRef.current.find((m) => m.role === "user")?.content || "Alice";
    void persist("assistant", text, title);
  }, [persist]);

  const ensureSession = useCallback(async (): Promise<TextConversation> => {
    if (sessionRef.current?.isOpen()) return sessionRef.current;
    if (sessionStartRef.current) return sessionStartRef.current;

    sessionStartRef.current = (async () => {
      const creds = await fetchAliceAgentSession(context, "text");
      if (!creds.signedUrl) throw new Error("Alice is unavailable right now.");
      const conv = await Conversation.startSession({
        signedUrl: creds.signedUrl,
        textOnly: true,
        userId: creds.userId,
        dynamicVariables: creds.dynamicVariables,
        overrides: { agent: { firstMessage: "" }, conversation: { textOnly: true } },
        clientTools: delegateClientTools(toolsRef),
        onMessage: ({ message, role }) => {
          if (role !== "agent" || !message?.trim()) return;
          const resolve = pendingReplyRef.current;
          if (resolve) {
            pendingReplyRef.current = null;
            resolve(message.trim());
          } else {
            appendFollowUp(message.trim());
          }
        },
        onDisconnect: () => {
          sessionRef.current = null;
          sessionStartRef.current = null;
        },
      });
      sessionRef.current = conv;

      // Resumed thread: give the fresh agent session the earlier turns as context.
      const prior = messagesRef.current.filter((m) => !m.pending && m.content.trim()).slice(-12);
      if (prior.length) {
        const transcript = prior.map((m) => `${m.role === "user" ? "User" : "Alice"}: ${m.content}`).join("\n");
        conv.sendContextualUpdate(`Earlier in this conversation:\n${transcript}`);
      }
      return conv;
    })().catch((err) => {
      sessionStartRef.current = null;
      throw err;
    });
    return sessionStartRef.current;
  }, [context, appendFollowUp]);

  const newChat = useCallback(() => {
    endSession();
    conversationIdRef.current = null;
    setConversationId(null);
    setMessages([]);
  }, [endSession]);

  const loadConversation = useCallback(async (id: string) => {
    const { data, error } = await db
      .from("alice_messages")
      .select("role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (error) return;
    endSession();
    conversationIdRef.current = id;
    setConversationId(id);
    setMessages((data || []).map((m: { role: string; content: string }) => ({ role: m.role as AliceRole, content: m.content })));
  }, [endSession]);

  /** Persists a turn that happened outside the text chat (e.g. a voice call transcript). */
  const recordTurn = useCallback(async (role: AliceRole, content: string) => {
    const text = content.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role, content: text }]);
    const title = messagesRef.current.find((m) => m.role === "user")?.content || (role === "user" ? text : "Voice call with Alice");
    await persist(role, text, title);
    qc.invalidateQueries({ queryKey: ["alice-conversations", context] });
  }, [persist, qc, context]);

  const send = useCallback(async (text: string): Promise<string | null> => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return null;

    const userMsg: AliceMessage = { role: "user", content: trimmed };
    const thread = [...messagesRef.current, userMsg];
    setMessages([...thread, { role: "assistant", content: "", pending: true }]);
    setIsSending(true);

    try {
      const convId = await persist("user", trimmed, trimmed);
      const session = await ensureSession();

      const reply = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingReplyRef.current = null;
          reject(new Error("Alice took too long to answer. Please try again."));
        }, REPLY_TIMEOUT_MS);
        pendingReplyRef.current = (t) => {
          clearTimeout(timer);
          resolve(t);
        };
        session.sendUserMessage(trimmed);
      });

      await persist("assistant", reply, trimmed);
      setMessages((prev) => [...prev.filter((m) => !m.pending), { role: "assistant", content: reply }]);
      qc.invalidateQueries({ queryKey: ["alice-conversations", context] });

      // Mirror into Support CRM so the user (and staff) can follow up from /support.
      if (context === "user") {
        void syncAliceTurnToSupport({
          conversationId: convId,
          title: trimmed.slice(0, 60),
          userText: trimmed,
          aliceText: reply,
        }).then(() => {
          qc.invalidateQueries({ queryKey: ["support-threads"] });
        });
      }

      return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      const fail = `⚠️ ${msg}`;
      setMessages([...thread, { role: "assistant", content: fail }]);
      return fail;
    } finally {
      setIsSending(false);
    }
  }, [isSending, context, qc, persist, ensureSession]);

  return {
    messages,
    isSending,
    conversationId,
    send,
    recordTurn,
    newChat,
    loadConversation,
    conversations: conversationsQuery.data || [],
  };
};
