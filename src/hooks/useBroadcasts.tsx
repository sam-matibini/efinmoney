import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// alice_* / broadcasts are not in the generated types yet — cast through `any`.
const db = supabase as unknown as {
  from: (t: string) => any;
};

export type BroadcastStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export interface Audience {
  scope: "all" | "segment" | "users";
  kyc_tier?: string[];
  kyc_status?: string[];
  country_code?: string[];
  user_ids?: string[];
}

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  channels: string[];
  status: BroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  in_app_count: number;
  email_count: number;
  error: string | null;
  created_at: string;
}

export const useBroadcasts = () =>
  useQuery({
    queryKey: ["broadcasts"],
    queryFn: async (): Promise<Broadcast[]> => {
      const { data, error } = await db.from("broadcasts")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []) as Broadcast[];
    },
    refetchInterval: 15_000,
  });

export interface BroadcastInput {
  title: string;
  body: string;
  audience: Audience;
  channels: string[];
  scheduled_at?: string | null;
}

/** Create a broadcast row. status: 'draft' | 'scheduled'. */
export const useCreateBroadcast = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, status }: { input: BroadcastInput; status: "draft" | "scheduled" }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await db.from("broadcasts").insert({
        title: input.title,
        body: input.body,
        audience: input.audience,
        channels: input.channels,
        status,
        scheduled_at: status === "scheduled" ? input.scheduled_at : null,
        created_by: auth.user?.id ?? null,
      }).select("*").single();
      if (error) throw error;
      return data as Broadcast;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }),
  });
};

/** Fire a broadcast immediately via the edge function (uses the admin's JWT). */
export const useSendBroadcast = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (broadcastId: string) => {
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: { mode: "send", broadcast_id: broadcastId },
      });
      if (error) {
        let detail = error.message;
        try { detail = (await (error as any)?.context?.json())?.error ?? detail; } catch { /* ignore */ }
        throw new Error(detail);
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }),
  });
};

export const useDeleteBroadcast = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("broadcasts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcasts"] }),
  });
};

/** Live recipient-count preview for the compose form. */
export const useAudienceCount = (audience: Audience) =>
  useQuery({
    queryKey: ["audience-count", audience],
    queryFn: async (): Promise<number> => {
      if (audience.scope === "users") return audience.user_ids?.length ?? 0;
      let q = db.from("profiles").select("user_id", { count: "exact", head: true }).not("user_id", "is", null);
      if (audience.scope === "segment") {
        if (audience.kyc_tier?.length) q = q.in("kyc_tier", audience.kyc_tier);
        if (audience.kyc_status?.length) q = q.in("kyc_status", audience.kyc_status);
        if (audience.country_code?.length) q = q.in("country_code", audience.country_code);
      }
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

export interface UserSearchResult { user_id: string; full_name: string | null; email: string | null; efin_tag: string | null; }

/** Search users to hand-pick a "specific users" audience. */
export const useUserSearch = (term: string) =>
  useQuery({
    queryKey: ["broadcast-user-search", term],
    enabled: term.trim().length >= 2,
    queryFn: async (): Promise<UserSearchResult[]> => {
      const t = `%${term.trim()}%`;
      const { data, error } = await db.from("profiles")
        .select("user_id, full_name, email, efin_tag")
        .or(`full_name.ilike.${t},email.ilike.${t},efin_tag.ilike.${t}`)
        .limit(10);
      if (error) throw error;
      return (data || []) as UserSearchResult[];
    },
  });
