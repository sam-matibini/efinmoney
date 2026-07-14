import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, UserCog, Fingerprint } from "lucide-react";

interface UnifiedLog {
  id: string;
  source: "system" | "staff" | "kyc";
  action: string;
  table_name: string;
  details: string;
  created_at: string;
}

const SOURCE_ICONS = {
  system: Shield,
  staff: UserCog,
  kyc: Fingerprint,
};

const SOURCE_LABELS = {
  system: "System",
  staff: "Staff",
  kyc: "KYC",
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: "bg-indigo-500/10 text-indigo-500",
  UPDATE: "bg-blue-500/10 text-blue-500",
  DELETE: "bg-red-500/10 text-red-500",
  approved: "bg-emerald-500/10 text-emerald-500",
  rejected: "bg-red-500/10 text-red-500",
  invited: "bg-purple-500/10 text-purple-500",
  suspended: "bg-amber-500/10 text-amber-500",
};

function actionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "bg-muted text-muted-foreground";
}

function truncateDetail(d: string): string {
  const firstLine = d.split("\n")[0];
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export const AuditLogsPanel = () => {
  const { data: systemLogs = [], isLoading: loadingSystem } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, table_name, new_data, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) { console.warn("audit_logs fetch failed", error); return []; }
      return (data || []).map((l: Record<string, unknown>) => ({
        id: l.id as string,
        source: "system" as const,
        action: String(l.action || ""),
        table_name: String(l.table_name || "-"),
        details: typeof l.new_data === "object" ? JSON.stringify(l.new_data) : String(l.new_data || ""),
        created_at: l.created_at as string,
      }));
    },
  });

  const { data: staffLogs = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["staff-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_audit_log")
        .select("id, action, details, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) { console.warn("staff_audit_log fetch failed", error); return []; }
      return (data || []).map((l: Record<string, unknown>) => ({
        id: l.id as string,
        source: "staff" as const,
        action: String(l.action || ""),
        table_name: "admin_users",
        details: typeof l.details === "object" ? JSON.stringify(l.details) : String(l.details || ""),
        created_at: l.created_at as string,
      }));
    },
  });

  const { data: kycLogs = [], isLoading: loadingKyc } = useQuery({
    queryKey: ["kyc-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kyc_audit_log")
        .select("id, action, notes, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) { console.warn("kyc_audit_log fetch failed", error); return []; }
      return (data || []).map((l: Record<string, unknown>) => ({
        id: l.id as string,
        source: "kyc" as const,
        action: String(l.action || ""),
        table_name: "kyc_verifications",
        details: String(l.notes || ""),
        created_at: l.created_at as string,
      }));
    },
  });

  const isLoading = loadingSystem || loadingStaff || loadingKyc;

  const allLogs: UnifiedLog[] = [...systemLogs, ...staffLogs, ...kycLogs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  ).slice(0, 100);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Logs ({allLogs.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    No audit logs found
                  </TableCell>
                </TableRow>
              ) : (
                allLogs.map((log) => {
                  const Icon = SOURCE_ICONS[log.source];
                  return (
                    <TableRow key={`${log.source}-${log.id}`}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <Icon className="h-3 w-3" />
                          {SOURCE_LABELS[log.source]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={actionColor(log.action)}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.table_name}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-[250px] text-sm text-muted-foreground truncate">
                        {log.details ? truncateDetail(log.details) : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
