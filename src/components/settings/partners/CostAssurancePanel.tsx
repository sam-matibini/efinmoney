import { useMemo, useState } from "react";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import {
  useCostAssurance,
  usePartnerInvoices,
  type PartnerInvoice,
} from "@/hooks/useCostAssurance";
import { usePartnerInvoiceLines } from "@/hooks/usePartnerOps";
import StatementUploadDialog from "./StatementUploadDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Receipt, Upload, Scale as ScaleIcon } from "lucide-react";
import { format } from "date-fns";

const INVOICE_CSV_COLUMNS = ["partner_reference", "transfer_id", "transaction_date", "currency_code", "amount", "billed_fee"];

const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CostAssurancePanel = () => {
  const { data: partners } = usePaymentPartners();
  const { data: summary, isLoading } = useCostAssurance(90);
  const { data: invoices } = usePartnerInvoices();

  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PartnerInvoice | null>(null);
  const { data: detailLines, isLoading: linesLoading } = usePartnerInvoiceLines(detail?.id);

  const nameOf = (id: string) => partners?.find((p) => p.id === id)?.name || "—";

  const totals = useMemo(() => {
    const rows = summary ?? [];
    return {
      billed: rows.reduce((s, r) => s + r.billed_total, 0),
      expected: rows.reduce((s, r) => s + r.expected_total, 0),
      variance: rows.reduce((s, r) => s + r.variance_total, 0),
      unmatched: rows.reduce((s, r) => s + r.unmatched_lines + r.missing_lines, 0),
    };
  }, [summary]);

  const downloadTemplate = () => {
    const blob = new Blob([`${INVOICE_CSV_COLUMNS.join(",")}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "partner-invoice-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScaleIcon className="h-5 w-5" /> Cost assurance
            </CardTitle>
            <CardDescription>
              What partners billed us against what our rate cards said the transactions should cost. Last 90 days.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              CSV template
            </Button>
            <Button size="sm" onClick={() => setOpen(true)} disabled={!partners?.length}>
              <Upload className="h-4 w-4 mr-1" /> Upload statement
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Billed by partners", value: money(totals.billed) },
              { label: "Expected from rate cards", value: money(totals.expected) },
              { label: "Variance", value: money(totals.variance), warn: Math.abs(totals.variance) > 0.01 },
              { label: "Unmatched lines", value: String(totals.unmatched), warn: totals.unmatched > 0 },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-lg font-semibold tabular-nums ${k.warn ? "text-destructive" : ""}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !summary?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No partner invoices reconciled yet. Upload an invoice to compare billed against expected cost.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Unmatched</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((r) => (
                    <TableRow key={r.partner_id}>
                      <TableCell className="font-medium">{r.partner_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.invoice_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.billed_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.expected_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant={Math.abs(r.variance_total) > 0.01 ? "destructive" : "secondary"}>
                          {money(r.variance_total)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.unmatched_lines + r.missing_lines}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Reconciled invoices
          </CardTitle>
          <CardDescription>Every invoice we matched line by line against recorded transaction economics.</CardDescription>
        </CardHeader>
        <CardContent>
          {!invoices?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No invoices uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(inv)}
                    >
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>{nameOf(inv.partner_id)}</TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(inv.period_start), "dd MMM yy")} –{" "}
                        {format(new Date(inv.period_end), "dd MMM yy")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(Number(inv.billed_total))} {inv.currency_code}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(Number(inv.expected_total))}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant={Math.abs(Number(inv.variance_total)) > 0.01 ? "destructive" : "secondary"}>
                          {money(Number(inv.variance_total))}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {inv.matched_lines} matched · {inv.unmatched_lines + inv.missing_lines} open
                      </TableCell>
                      <TableCell className="text-xs capitalize">{inv.status.replace(/_/g, " ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <StatementUploadDialog open={open} onOpenChange={setOpen} />


      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice {detail?.invoice_number}</DialogTitle>
            <DialogDescription>
              Line-by-line comparison of what the partner billed against the cost our rate cards predicted.
            </DialogDescription>
          </DialogHeader>
          {linesLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !detailLines?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No lines recorded for this invoice.</p>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Billed fee</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailLines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">
                        {l.partner_reference || l.transfer_id?.slice(0, 8) || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.transaction_date ? format(new Date(l.transaction_date), "dd MMM yy") : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.amount === null ? "—" : money(Number(l.amount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(Number(l.billed_fee))}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.expected_fee === null ? "—" : money(Number(l.expected_fee))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge
                          variant={Math.abs(Number(l.variance ?? 0)) > 0.01 ? "destructive" : "secondary"}
                        >
                          {money(Number(l.variance ?? 0))}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {l.match_status.replace(/_/g, " ")}
                        {l.match_method && (
                          <span className="block text-[10px] text-muted-foreground">
                            via {l.match_method.replace(/_/g, " ")}
                          </span>
                        )}
                      </TableCell>

                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CostAssurancePanel;
