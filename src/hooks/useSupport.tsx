import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export type ThreadStatus = "open" | "pending" | "resolved" | "closed";

export interface SupportThread {
  id: string;
  user_id: string;
  subject: string;
  status: ThreadStatus;
  assigned_to: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_for_staff: boolean;
  unread_for_user: boolean;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  thread_id: string;
  sender_role: "user" | "staff";
  sender_id: string;
  body: string;
  created_at: string;
}

/** Threads visible to the caller (RLS: own for users, all for staff). */
export const useSupportThreads = () => {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["support-threads"],
    queryFn: async (): Promise<SupportThread[]> => {
      const { data, error } = await db.from("support_threads")
        .select("*").order("last_message_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []) as SupportThread[];
    },
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("support-threads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" },
        () => qc.invalidateQueries({ queryKey: ["support-threads"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return query;
};

export const useThreadMessages = (threadId: string | null) => {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["support-messages", threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<SupportMessage[]> => {
      const { data, error } = await db.from("support_messages")
        .select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as SupportMessage[];
    },
  });

  useEffect(() => {
    if (!threadId) return;
    const ch = supabase
      .channel(`support-messages-${threadId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${threadId}` },
        () => qc.invalidateQueries({ queryKey: ["support-messages", threadId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [threadId, qc]);

  return query;
};

/** User: open a new conversation (thread + first message). */
export const useCreateThread = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ subject, body }: { subject: string; body: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { data: thread, error } = await db.from("support_threads")
        .insert({ user_id: uid, subject }).select("*").single();
      if (error) throw error;
      const { error: mErr } = await db.from("support_messages")
        .insert({ thread_id: thread.id, sender_role: "user", sender_id: uid, body });
      if (mErr) throw mErr;
      return thread as SupportThread;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-threads"] }),
  });
};

export const useSendMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, body, role }: { threadId: string; body: string; role: "user" | "staff" }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await db.from("support_messages")
        .insert({ thread_id: threadId, sender_role: role, sender_id: uid, body });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["support-messages", v.threadId] });
      qc.invalidateQueries({ queryKey: ["support-threads"] });
    },
  });
};

export const useUpdateThread = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SupportThread> }) => {
      const { error } = await db.from("support_threads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-threads"] }),
  });
};

export interface MiniProfile { user_id: string; full_name: string | null; email: string | null; avatar_url: string | null; }

/** Staff-side: resolve customer display info for a set of threads. */
export const useProfilesByIds = (ids: string[]) =>
  useQuery({
    queryKey: ["support-profiles", [...ids].sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, MiniProfile>> => {
      const { data, error } = await db.from("profiles")
        .select("user_id, full_name, email, avatar_url").in("user_id", ids);
      if (error) throw error;
      const map: Record<string, MiniProfile> = {};
      for (const p of (data || []) as MiniProfile[]) map[p.user_id] = p;
      return map;
    },
  });
