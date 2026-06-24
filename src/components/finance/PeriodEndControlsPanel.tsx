import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Lock, LockKeyhole, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

export const PeriodEndControlsPanel = () => {
  const qc = useQueryClient();
  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["period-locks"],
    queryFn: async () => {
      const { data } = await supabase.from("period_locks").select("*").order("period_end", { ascending: false });
      return data || [];
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from("period_locks").update({ status, locked_at: status === "locked" ? new Date().toISOString() : null, locked_by: status === "locked" ? (await supabase.auth.getUser()).data.user?.id : null }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["period-locks"] }),
  });

  const createPeriod = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      await supabase.from("period_locks").insert({ period_start: start.toISOString().split("T")[0], period_end: end.toISOString().split("T")[0] });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["period-locks"] }); toast.success("Period created"); },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><LockKeyhole className="w-5 h-5" />Period-End Controls</CardTitle>
            <p className="text-sm text-muted-foreground">Month-end close: Reconciliation → Finance Review → Controller Approval → Lock</p>
          </div>
          <Button size="sm" onClick={() => createPeriod.mutate()}><Plus className="w-4 h-4 mr-1" />New Period</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Locked By</TableHead><TableHead>Locked At</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {periods.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No periods created. Create your first period to begin.</TableCell></TableRow> : periods.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{format(new Date(p.period_start), "MMM yyyy")}</TableCell>
                    <TableCell>
                      {p.status === "locked" ? <Badge className="bg-emerald-500/10 text-emerald-600">Locked</Badge>
                        : p.status === "approved" ? <Badge className="bg-blue-500/10 text-blue-600">Approved</Badge>
                        : p.status === "controller_review" ? <Badge className="bg-purple-500/10 text-purple-600">Controller Review</Badge>
                        : p.status === "review_pending" ? <Badge className="bg-amber-500/10 text-amber-600">Review Pending</Badge>
                        : <Badge className="bg-muted">Open</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.locked_by ? "✓" : "—"}</TableCell>
                    <TableCell className="text-xs">{p.locked_at ? format(new Date(p.locked_at), "MMM d, h:mm a") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {p.status === "open" && <Button size="sm" variant="outline" onClick={() => advanceMutation.mutate({ id: p.id, status: "review_pending" })}>Submit for Review</Button>}
                      {p.status === "review_pending" && <Button size="sm" variant="outline" onClick={() => advanceMutation.mutate({ id: p.id, status: "controller_review" })}>Controller Review</Button>}
                      {p.status === "controller_review" && <Button size="sm" variant="outline" onClick={() => advanceMutation.mutate({ id: p.id, status: "approved" })}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve</Button>}
                      {p.status === "approved" && <Button size="sm" onClick={() => advanceMutation.mutate({ id: p.id, status: "locked" })}><Lock className="w-3.5 h-3.5 mr-1" />Lock Period</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};