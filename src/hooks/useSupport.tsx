import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export type ThreadStatus = "open" | "pending" | "resolved" | "closed";

export interface Attachment {
  path: string;
  name: string;
  size: number;
  type: string;
}

async function uploadSupportFiles(uid: string, files: File[]): Promise<Attachment[]> {
  const results: Attachment[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, file);
    if (!error) results.push({ path, name: file.name, size: file.size, type: file.type });
  }
  return results;
}

export async function getAttachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("support-attachments").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export type SupportChannel = "app" | "contact" | "chat" | "reception";

export interface SupportThread {
  id: string;
  user_id: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  channel?: SupportChannel;
  subject: string;
  status: ThreadStatus;
  priority?: "low" | "normal" | "high" | "urgent";
  escalated_at?: string | null;
  assigned_to: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_for_staff: boolean;
  unread_for_user: boolean;
  created_at: string;
  external_source?: string | null;
  external_ref?: string | null;
}

export interface SupportMessage {
  id: string;
  thread_id: string;
  sender_role: "user" | "staff";
  sender_id: string | null;
  body: string;
  attachments: Attachment[];
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
    mutationFn: async ({ subject, body, files = [], channel }: { subject: string; body: string; files?: File[]; channel?: SupportChannel }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("user_id", uid).single();

      const { data: thread, error } = await db.from("support_threads")
        .insert({ user_id: uid, subject, ...(channel ? { channel } : {}) }).select("*").single();
      if (error) throw error;
      const attachments = files.length ? await uploadSupportFiles(uid, files) : [];
      const { error: mErr } = await db.from("support_messages")
        .insert({ thread_id: thread.id, sender_role: "user", sender_id: uid, body, attachments });
      if (mErr) throw mErr;

      // Fire-and-forget: email the support team
      supabase.functions.invoke("notify-staff", {
        body: {
          type: "new_thread",
          thread_id: thread.id,
          subject,
          preview: body.slice(0, 300),
          sender_name: (profile as any)?.full_name || (profile as any)?.email || "A customer",
        },
      }).catch(() => { /* non-blocking */ });

      return thread as SupportThread;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-threads"] }),
  });
};

export const useSendMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, body, role, files = [] }: { threadId: string; body: string; role: "user" | "staff"; files?: File[] }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const attachments = files.length ? await uploadSupportFiles(uid, files) : [];
      const { error } = await db.from("support_messages")
        .insert({ thread_id: threadId, sender_role: role, sender_id: uid, body, attachments });
      if (error) throw error;

      // Email staff when a user (not staff) sends a reply
      if (role === "user") {
        const [{ data: thread }, { data: profile }] = await Promise.all([
          db.from("support_threads").select("subject").eq("id", threadId).single(),
          supabase.from("profiles").select("full_name, email").eq("user_id", uid).single(),
        ]);
        supabase.functions.invoke("notify-staff", {
          body: {
            type: "reply",
            thread_id: threadId,
            subject: (thread as any)?.subject || "Support ticket",
            preview: body.slice(0, 300),
            sender_name: (profile as any)?.full_name || (profile as any)?.email || "A customer",
          },
        }).catch(() => { /* non-blocking */ });
      } else {
        // Staff replied. A guest thread (no account) has no in-app bell, so
        // email the reply back to the customer to close the loop.
        const { data } = await db.from("support_threads")
          .select("subject, guest_email, guest_name, user_id").eq("id", threadId).single();
        const thread = data as Pick<SupportThread, "subject" | "guest_email" | "guest_name" | "user_id"> | null;
        if (thread?.guest_email && !thread.user_id) {
          supabase.functions.invoke("notify-guest-reply", {
            body: {
              thread_id: threadId,
              guest_email: thread.guest_email,
              guest_name: thread.guest_name,
              subject: thread.subject || "your support request",
              preview: body.slice(0, 1000),
            },
          }).catch(() => { /* non-blocking */ });
        }
      }
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

export const useDeleteThreads = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await db.from("support_threads").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-threads"] }),
  });
};

export interface MiniProfile { user_id: string; full_name: string | null; email: string | null; avatar_url: string | null; }

/** Staff-side: resolve customer display info for a set of threads. */
export const useEscalateThread = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: thread } = await db.from("support_threads")
        .select("subject").eq("id", id).single();

      const { error } = await db.from("support_threads")
        .update({ priority: "urgent", escalated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      supabase.functions.invoke("notify-staff", {
        body: {
          type: "escalation",
          thread_id: id,
          subject: `[URGENT] ${(thread as any)?.subject ?? "Support ticket"}`,
          preview: "The customer has flagged this conversation as urgent.",
          sender_name: "Customer",
        },
      }).catch(() => {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-threads"] }),
  });
};

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
