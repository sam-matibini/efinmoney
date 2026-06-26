import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, AlertTriangle } from "lucide-react";
import { useUboComplianceView } from "@/hooks/useBeneficialOwners";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function BeneficialOwnershipPage() {
  const { data: entries = [], isLoading } = useUboComplianceView();

  const pepCount = entries.filter((e: any) => e.pep_owners > 0).length;
  const sanctionsHits = entries.filter((e: any) => e.sanctions_hits > 0).length;

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Beneficial Ownership Registry</h1><p className="text-muted-foreground">25%+ ownership disclosure, PEP screening, and sanctions checks</p></div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{entries.length}</div><div className="text-xs text-muted-foreground">Entities reviewed</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{pepCount}</div><div className="text-xs text-muted-foreground">PEP-linked entities</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{sanctionsHits}</div><div className="text-xs text-muted-foreground">Sanctions hits</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" />UBO Compliance View</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Risk Level</TableHead><TableHead>Owners ≥25%</TableHead><TableHead>PEP Owners</TableHead><TableHead>Sanctions Hits</TableHead><TableHead>Unverified</TableHead></TableRow></TableHeader>
              <TableBody>
                {entries.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No beneficial ownership data. Submit UBO declarations from the KYC review screen.</TableCell></TableRow> : entries.map((e: any) => (
                  <TableRow key={e.customer_id}>
                    <TableCell className="font-medium">{e.customer_name}</TableCell>
                    <TableCell><Badge className={e.risk_level === "high" ? "bg-red-500/10 text-red-600" : e.risk_level === "medium" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}>{e.risk_level}</Badge></TableCell>
                    <TableCell>{e.owners_25pct_plus}</TableCell>
                    <TableCell>{e.pep_owners > 0 ? <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" />{e.pep_owners}</span> : "0"}</TableCell>
                    <TableCell>{e.sanctions_hits > 0 ? <span className="text-red-600 font-bold">{e.sanctions_hits}</span> : "0"}</TableCell>
                    <TableCell>{e.unverified_owners > 0 ? <Badge className="bg-amber-500/10 text-amber-600">{e.unverified_owners}</Badge> : <Badge className="bg-emerald-500/10 text-emerald-600">All verified</Badge>}</TableCell>
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
