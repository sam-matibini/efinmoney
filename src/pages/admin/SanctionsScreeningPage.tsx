import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban, RefreshCw, Play } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const resultBadge = (r: string) => {
  const m: Record<string, string> = {
    hit: "bg-red-500/10 text-red-600",
    clear: "bg-emerald-500/10 text-emerald-600",
    error: "bg-amber-500/10 text-amber-600",
  };
  return <Badge className={m[r] || "bg-muted"}>{r}</Badge>;
};

export default function SanctionsScreeningPage() {
  const qc = useQueryClient();

  const { data: screenings = [], isLoading } = useQuery({
    queryKey: ["aml-screenings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("aml_screenings")
        .select("*")
        .order("screened_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: watchlist = [] } = useQuery({
    queryKey: ["aml-watchlist"],
    queryFn: async () => {
      const { data } = await supabase
        .from("aml_watchlist")
        .select("id, name, source, entity_type, ingested_at")
        .order("ingested_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: watchlistCount = 0 } = useQuery({
    queryKey: ["aml-watchlist-count"],
    queryFn: async () => {
      const { count } = await supabase.from("aml_watchlist").select("id", { count: "exact", head: true });
      return count || 0;
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sanctions-sync");
      if (error) throw error;
      return data as { total: number; sources: Record<string, { count: number; error?: string }> };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["aml-watchlist"] });
      qc.invalidateQueries({ queryKey: ["aml-watchlist-count"] });
      const parts = Object.entries(d.sources || {}).map(([s, r]) => `${s.toUpperCase()}: ${r.error ? "failed" : r.count}`);
      toast.success(`Synced ${d.total.toLocaleString()} entries — ${parts.join(", ")}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "List sync failed"),
  });

  const screenMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("run_sanctions_screening_all");
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["aml-screenings"] });
      toast.success(n > 0 ? `Screened ${n} customer${n > 1 ? "s" : ""}` : "No customers due for screening");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Screening failed"),
  });

  const hits = screenings.filter((s: any) => s.status === "hit").length;
  const clear = screenings.filter((s: any) => s.status === "clear").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><h1 className="text-3xl font-bold tracking-tight">Sanctions Screening</h1><p className="text-muted-foreground">OFAC, UN — list ingestion, fuzzy matching, and daily customer rescreening</p></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} /> {syncMutation.isPending ? "Syncing…" : "Sync lists"}
            </Button>
            <Button className="gap-1.5" onClick={() => screenMutation.mutate()} disabled={screenMutation.isPending}>
              <Play className="w-4 h-4" /> {screenMutation.isPending ? "Screening…" : "Run screening"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{screenings.length}</div><div className="text-xs text-muted-foreground">Screenings</div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{hits}</div><div className="text-xs text-muted-foreground">Hits</div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{clear}</div><div className="text-xs text-muted-foreground">Clear</div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{watchlistCount.toLocaleString()}</div><div className="text-xs text-muted-foreground">Watchlist entries</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Ban className="w-5 h-5" />Screening Results</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <Table>
                <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Trigger</TableHead><TableHead>Result</TableHead><TableHead>Matches</TableHead><TableHead>Country</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {screenings.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No screenings yet. Sync lists, then run screening.</TableCell></TableRow> : screenings.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.subject_name || "—"}</TableCell>
                      <TableCell className="capitalize text-sm text-muted-foreground">{s.trigger?.replace(/_/g, " ") || "—"}</TableCell>
                      <TableCell>{resultBadge(s.status || "clear")}</TableCell>
                      <TableCell className="font-mono">{s.match_count ?? 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.subject_country || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{s.screened_at ? format(new Date(s.screened_at), "MMM d, h:mm a") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {watchlist.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Recent Watchlist Entries</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>List</TableHead><TableHead>Ingested</TableHead></TableRow></TableHeader>
                <TableBody>
                  {watchlist.map((w: any) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{w.name || "—"}</TableCell>
                      <TableCell className="capitalize text-sm text-muted-foreground">{w.entity_type || "—"}</TableCell>
                      <TableCell className="text-xs uppercase">{w.source || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{w.ingested_at ? format(new Date(w.ingested_at), "MMM d, yyyy") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
