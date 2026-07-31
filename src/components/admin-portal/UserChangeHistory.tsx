import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { History } from "lucide-react";
import { format } from "date-fns";

interface AuditRow {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

const label = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** Profile change history for a single user, sourced from audit_logs. */
export default function UserChangeHistory({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-audit", userId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("audit_logs")
        .select("id, action, created_at, user_id, old_data, new_data")
        .eq("table_name", "profiles")
        .eq("record_id", userId)
        .order("created_at", { ascending: false })
        .limit(25);

      const list = (rows || []) as unknown as AuditRow[];
      const actorIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean) as string[]));
      const actors = actorIds.length
        ? (await supabase.from("admin_users").select("id, full_name, email").in("id", actorIds)).data || []
        : [];
      const actorMap = new Map(actors.map((a) => [a.id, a.full_name || a.email || "Staff"]));
      return list.map((r) => ({ ...r, actor: r.user_id ? actorMap.get(r.user_id) || "Staff" : "System" }));
    },
    enabled: !!userId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4" /> Change history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No profile changes recorded yet.</p>
        ) : (
          data.map((entry) => (
            <div key={entry.id} className="border-l-2 border-border pl-3 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{entry.actor}</span>
                <span>{format(new Date(entry.created_at), "PPp")}</span>
              </div>
              <ul className="text-sm space-y-0.5">
                {Object.keys(entry.new_data || {}).map((k) => (
                  <li key={k}>
                    <span className="text-muted-foreground">{label(k)}: </span>
                    <span className="line-through text-muted-foreground">{show(entry.old_data?.[k])}</span>
                    <span className="mx-1">→</span>
                    <span className="font-medium">{show(entry.new_data?.[k])}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
