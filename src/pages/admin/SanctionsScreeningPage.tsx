import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const resultBadge = (r: string) => {
  const m: Record<string, string> = { hit: "bg-red-500/10 text-red-600", clear: "bg-emerald-500/10 text-emerald-600", pending: "bg-amber-500/10 text-amber-600", escalated: "bg-orange-500/10 text-orange-600" };
  return <Badge className={m[r] || ""}>{r}</Badge>;
};

export default function SanctionsScreeningPage() {
  const { data: screenings = [], isLoading } = useQuery({
    queryKey: ["aml-screenings"],
    queryFn: async () => {
      const { data } = await supabase.from("aml_screenings").select("*").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: watchlist = [] } = useQuery({
    queryKey: ["aml-watchlist"],
    queryFn: async () => {
      const { data } = await supabase.from("aml_watchlist").select("*").order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const hits = screenings.filter((s: any) => s.screening_result === "hit").length;
  const pending = screenings.filter((s: any) => s.screening_result === "pending").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Sanctions Screening</h1><p className="text-muted-foreground">OFAC, UN, OSFI — real-time and batch customer screening results</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{screenings.length}</div><div className="text-xs text-muted-foreground">Total screenings</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{hits}</div><div className="text-xs text-muted-foreground">Hits</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{pending}</div><div className="text-xs text-muted-foreground">Pending review</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Ban className="w-5 h-5" />Screening Results</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Screening Type</TableHead><TableHead>Result</TableHead><TableHead>Match Score</TableHead><TableHead>List Source</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {screenings.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No screenings yet.</TableCell></TableRow> : screenings.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="capitalize font-medium">{s.screening_type?.replace(/_/g, " ") || "—"}</TableCell>
                    <TableCell>{resultBadge(s.screening_result || "pending")}</TableCell>
                    <TableCell className="font-mono">{s.match_score != null ? `${s.match_score}%` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.list_source || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(s.created_at), "MMM d, h:mm a")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {watchlist.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Watchlist Entries</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>List</TableHead><TableHead>Added</TableHead></TableRow></TableHeader>
              <TableBody>
                {watchlist.map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name || w.full_name || "—"}</TableCell>
                    <TableCell className="text-xs">{w.list_source || w.source || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(w.created_at), "MMM d, yyyy")}</TableCell>
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
