import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TreasuryTransfer, TreasuryReceived } from "@/hooks/useTreasury";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (["posted", "succeeded"].includes(s)) return "default";
  if (["failed", "returned", "canceled"].includes(s)) return "destructive";
  return "secondary";
}

export function TreasuryActivityTable({
  transfers,
  received,
}: {
  transfers: TreasuryTransfer[];
  received: TreasuryReceived[];
}) {
  const rows = [
    ...transfers.map(t => ({
      id: t.id,
      kind: t.kind,
      direction: t.direction,
      amount: Number(t.amount),
      status: t.status,
      stripe_id: t.stripe_id,
      desc: t.description,
      created_at: t.created_at,
      network: t.network,
    })),
    ...received.map(r => ({
      id: r.id,
      kind: r.kind,
      direction: r.kind === "received_credit" ? ("credit" as const) : ("debit" as const),
      amount: Number(r.amount),
      status: r.status,
      stripe_id: r.stripe_id,
      desc: r.description,
      created_at: r.created_at,
      network: null as string | null,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (rows.length === 0) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">No activity yet.</CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{r.kind.replace(/_/g, " ")}</TableCell>
                <TableCell className="text-sm">{r.network ?? "—"}</TableCell>
                <TableCell className="text-sm font-mono truncate max-w-[260px]">{r.desc ?? r.stripe_id}</TableCell>
                <TableCell><Badge variant={statusVariant(r.status)}>{r.status}</Badge></TableCell>
                <TableCell className={`text-right font-semibold ${r.direction === "credit" ? "text-emerald-500" : ""}`}>
                  {r.direction === "credit" ? "+" : "-"}{fmt(r.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
