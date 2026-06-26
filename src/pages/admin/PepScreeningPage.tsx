import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import AdminLayout from "@/components/admin-portal/AdminLayout";

const pepBadge = (s: string) => {
  const m: Record<string, string> = { domestic_pep: "bg-amber-500/10 text-amber-600", foreign_pep: "bg-orange-500/10 text-orange-600", hio: "bg-red-500/10 text-red-600", family_member: "bg-purple-500/10 text-purple-600", close_associate: "bg-blue-500/10 text-blue-600" };
  return <Badge className={m[s] || ""}>{s.replace(/_/g, " ")}</Badge>;
};

export default function PepScreeningPage() {
  const { data: peps = [], isLoading } = useQuery({
    queryKey: ["pep-beneficial-owners"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("beneficial_owners")
        .select("*")
        .neq("pep_status", "none")
        .order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const hio = peps.filter((p: any) => p.pep_status === "hio").length;
  const sanctionsHits = peps.filter((p: any) => p.sanctions_status === "hit" || p.sanctions_status === "escalated").length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">PEP Screening</h1><p className="text-muted-foreground">Politically Exposed Persons — domestic, foreign, HIO, family, close associates</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{peps.length}</div><div className="text-xs text-muted-foreground">PEP-linked individuals</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{hio}</div><div className="text-xs text-muted-foreground">HIOs</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-orange-500">{sanctionsHits}</div><div className="text-xs text-muted-foreground">Sanctions hits</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserX className="w-5 h-5" />PEP Register</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>PEP Type</TableHead><TableHead>Ownership %</TableHead><TableHead>Nationality</TableHead><TableHead>Sanctions Status</TableHead><TableHead>Verified</TableHead><TableHead>Added</TableHead></TableRow></TableHeader>
              <TableBody>
                {peps.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No PEP-linked individuals on record.</TableCell></TableRow> : peps.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>{pepBadge(p.pep_status)}</TableCell>
                    <TableCell className="font-mono">{p.ownership_pct}%</TableCell>
                    <TableCell>{p.nationality || "—"}</TableCell>
                    <TableCell><Badge className={p.sanctions_status === "hit" ? "bg-red-500/10 text-red-600" : p.sanctions_status === "clear" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted"}>{p.sanctions_status}</Badge></TableCell>
                    <TableCell>{p.verified_at ? <Badge className="bg-emerald-500/10 text-emerald-600">Verified</Badge> : <Badge className="bg-amber-500/10 text-amber-600">Unverified</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}
