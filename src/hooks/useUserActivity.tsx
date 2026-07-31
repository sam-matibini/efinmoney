import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ActivitySource =
  | "communication"
  | "notification"
  | "support"
  | "account"
  | "staff_change";

export interface UnifiedActivity {
  id: string;
  source: ActivitySource;
  /** Machine-readable event/channel key, e.g. "email", "kyc_status_changed". */
  kind: string;
  title: string;
  body?: string | null;
  actor?: string | null;
  createdAt: string;
  /** Extra key/value details rendered under the entry. */
  details?: Record<string, unknown> | null;
}

// support_threads / support_messages and account_activity aren't in generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

const humanize = (s: string) =>
  s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Merges every trackable interaction for one user into a single chronological
 * feed: outbound emails/SMS, system notifications, support messages, account
 * and security events, and staff-made profile changes.
 */
export function useUserActivity(userId?: string) {
  return useQuery({
    queryKey: ["user-activity-timeline", userId],
    enabled: !!userId,
    queryFn: async (): Promise<UnifiedActivity[]> => {
      const uid = userId!;

      const [comms, notifs, account, audit, threads] = await Promise.all([
        supabase
          .from("customer_communications")
          .select("id,channel,direction,subject,content,status,template_id,created_at,created_by,metadata")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("notifications")
          .select("id,title,message,type,is_read,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("account_activity")
          .select("id,event_type,description,actor_type,actor_id,metadata,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("audit_logs")
          .select("id,action,entity_type,entity_id,changes,actor_id,created_at")
          .eq("entity_id", uid)
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("support_threads")
          .select("id,subject")
          .eq("user_id", uid)
          .limit(50),
      ]);

      const items: UnifiedActivity[] = [];

      for (const c of (comms.data || []) as any[]) {
        items.push({
          id: `comm-${c.id}`,
          source: "communication",
          kind: c.channel,
          title: c.subject || `${humanize(c.channel)} ${c.direction}`,
          body: c.content,
          actor: c.direction === "outbound" ? "eFinMoney" : "Customer",
          createdAt: c.created_at,
          details: { direction: c.direction, status: c.status, template: c.template_id },
        });
      }

      for (const n of (notifs.data || []) as any[]) {
        items.push({
          id: `notif-${n.id}`,
          source: "notification",
          kind: n.type || "notification",
          title: n.title,
          body: n.message,
          actor: "System",
          createdAt: n.created_at,
          details: { read: n.is_read ? "yes" : "no" },
        });
      }

      for (const a of ((account as any).data || []) as any[]) {
        items.push({
          id: `acct-${a.id}`,
          source: "account",
          kind: a.event_type,
          title: humanize(a.event_type),
          body: a.description,
          actor: humanize(a.actor_type || "system"),
          createdAt: a.created_at,
          details: a.metadata && Object.keys(a.metadata).length ? a.metadata : null,
        });
      }

      for (const l of (audit.data || []) as any[]) {
        items.push({
          id: `audit-${l.id}`,
          source: "staff_change",
          kind: l.action,
          title: `Staff ${humanize(l.action).toLowerCase()}`,
          body: null,
          actor: "Staff",
          createdAt: l.created_at,
          details: (l.changes as Record<string, unknown>) || null,
        });
      }

      const threadRows = ((threads as any).data || []) as { id: string; subject: string }[];
      if (threadRows.length) {
        const subjectById = new Map(threadRows.map((t) => [t.id, t.subject]));
        const { data: msgs } = await db
          .from("support_messages")
          .select("id,thread_id,sender_role,body,created_at")
          .in("thread_id", threadRows.map((t) => t.id))
          .order("created_at", { ascending: false })
          .limit(200);
        for (const m of ((msgs || []) as any[])) {
          items.push({
            id: `msg-${m.id}`,
            source: "support",
            kind: m.sender_role,
            title: subjectById.get(m.thread_id) || "Support message",
            body: m.body,
            actor: m.sender_role === "staff" ? "Staff" : "Customer",
            createdAt: m.created_at,
          });
        }
      }

      return items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },
  });
}
