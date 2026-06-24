import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ShieldCheck, Plus, Clock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

const regulatorLabel = (r: string) => r.replace(/_/g, " ");
const frequencyLabel = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);
const urgencyBadge = (u: string) => {
  if (u === "overdue") return <Badge className="bg-red-600/10 text-red-600">Overdue</Badge>;
  if (u === "due_soon") return <Badge className="bg-amber-500/10 text-amber-600">Due Soon</Badge>;
  return <Badge className="bg-blue-500/10 text-blue-600">Upcoming</Badge>;
};

export default function ComplianceRegisterPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: obligations = [], isLoading } = useQuery({
    queryKey: ["compliance-obligations"],
    queryFn: async () => {
      const { data } = await supabase.from("compliance_obligations").select("*").order("next_due", { ascending: true, nullsFirst: false });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const { data: calendar = [] } = useQuery({
    queryKey: ["compliance-calendar"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data } = await db.from("compliance_calendar_view").select("*");
      return data || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from("compliance_obligations").update({ status, last_reviewed: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-obligations"] }),
  });

  const overdue = obligations.filter((o: any) => o.status === "overdue" || (o.next_due && new Date(o.next_due) < new Date())).length;

  return (
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Compliance Register & Calendar</h1><p className="text-muted-foreground">Regulatory obligations by regulator and frequency</p></div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Obligation</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{obligations.length}</div><div className="text-xs text-muted-foreground">Total obligations</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{overdue}</div><div className="text-xs text-muted-foreground">Overdue</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{calendar.length}</div><div className="text-xs text-muted-foreground">Due in 90 days</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" />Compliance Obligations</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Requirement</TableHead><TableHead>Regulator</TableHead><TableHead>Frequency</TableHead><TableHead>Next Due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {obligations.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No obligations registered.</TableCell></TableRow> : obligations.map((o: any) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.requirement}</TableCell>
                    <TableCell>{regulatorLabel(o.regulator)}</TableCell>
                    <TableCell>{frequencyLabel(o.frequency)}</TableCell>
                    <TableCell className="text-xs">{o.next_due ? format(new Date(o.next_due), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell><Badge className={o.status === "overdue" ? "bg-red-500/10 text-red-600" : o.status === "completed" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted"}>{o.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {o.status !== "completed" && <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: o.id, status: "completed" })}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Complete</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" />Upcoming Calendar (90 days)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Requirement</TableHead><TableHead>Due</TableHead><TableHead>Urgency</TableHead></TableRow></TableHeader>
            <TableBody>
              {calendar.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No upcoming deadlines.</TableCell></TableRow> : (calendar as any[]).map((c: any) => (
                <TableRow key={c.id}><TableCell>{c.requirement}</TableCell><TableCell>{format(new Date(c.next_due), "MMM d, yyyy")}</TableCell><TableCell>{urgencyBadge(c.urgency)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}