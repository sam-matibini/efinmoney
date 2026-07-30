import { useMemo, useState } from "react";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import {
  usePartnerInvoices,
  usePartnerSettlements,
  useSettlementAccounts,
  useApproveInvoice,
  usePaySettlement,
  type PartnerInvoice,
} from "@/hooks/useCostAssurance";
import { usePartnerInvoiceLines } from "@/hooks/usePartnerOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, CheckCircle2, AlertTriangle, Wallet } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const money = (n: number, ccy: string) =>
  `${ccy} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  reconciled: "secondary",
  disputed: "destructive",
  approved: "default",
  paid: "default",
  void: "outline",
};

export const PartnerSettlementsPanel = () => {
  const { data: partners = [] } = usePaymentPartners();
  const { data: invoices = [], isLoading } = usePartnerInvoices();
  const { data: settlements = [] } = usePartnerSettlements();
  const approve = useApproveInvoice();
  const pay = usePaySettlement();

  const [reviewInvoice, setReviewInvoice] = useState<PartnerInvoice | null>(null);
  const [disputedIds, setDisputedIds] = useState<string[]>([]);
  const [disputeReason, setDisputeReason] = useState("");
  const { data: reviewLines = [] } = usePartnerInvoiceLines(reviewInvoice?.id);

  const [payOpen, setPayOpen] = useState(false);
  const [payPartner, setPayPartner] = useState<string>("");
  const [payCurrency, setPayCurrency] = useState<string>("");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [fundingAccount, setFundingAccount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");

  const { data: accounts = [] } = useSettlementAccounts(payCurrency || undefined);
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? "—";

  const queue = useMemo(
    () => invoices.filter((i) => ["reconciled", "disputed", "approved", "draft"].includes(i.status)),
    [invoices],
  );

  const approvedForPay = useMemo(
    () =>
      invoices.filter(
        (i) => i.status === "approved" && (!payPartner || i.partner_id === payPartner) && (!payCurrency || i.currency_code === payCurrency),
      ),
    [invoices, payPartner, payCurrency],
  );

  const aging = useMemo(() => {
    const map = new Map<string, { partner_id: string; currency: string; outstanding: number; count: number }>();
    invoices
      .filter((i) => i.status === "approved")
      .forEach((i) => {
        const key = `${i.partner_id}|${i.currency_code}`;
        const row = map.get(key) ?? { partner_id: i.partner_id, currency: i.currency_code, outstanding: 0, count: 0 };
        row.outstanding += Number(i.approved_total ?? 0);
        row.count += 1;
        map.set(key, row);
      });
    return [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
  }, [invoices]);

  const openReview = (inv: PartnerInvoice) => {
    setReviewInvoice(inv);
    setDisputedIds([]);
    setDisputeReason("");
  };

  const selectedTotal = approvedForPay
    .filter((i) => selectedInvoices.includes(i.id))
    .reduce((s, i) => s + Number(i.approved_total ?? 0), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" /> Invoice approval queue
            </CardTitle>
            <CardDescription>
              Approve reconciled partner invoices to post network fees to the ledger, or dispute individual billed lines.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setPayOpen(true);
              setSelectedInvoices([]);
            }}
          >
            <Wallet className="mr-1 h-4 w-4" /> Record settlement
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : queue.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No invoices awaiting approval. Reconcile a partner invoice in Cost assurance first.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Disputed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{partnerName(inv.partner_id)}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.period_start} → {inv.period_end}
                    </TableCell>
                    <TableCell className="text-right">{money(inv.billed_total, inv.currency_code)}</TableCell>
                    <TableCell className="text-right">{money(inv.expected_total, inv.currency_code)}</TableCell>
                    <TableCell className={`text-right ${Number(inv.variance_total) > 0 ? "text-destructive" : ""}`}>
                      {money(inv.variance_total, inv.currency_code)}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(inv.disputed_total ?? 0) > 0 ? money(Number(inv.disputed_total), inv.currency_code) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openReview(inv)}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> Outstanding payables
            </CardTitle>
            <CardDescription>Approved invoices posted to Partner Payables but not yet settled.</CardDescription>
          </CardHeader>
          <CardContent>
            {aging.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing outstanding.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aging.map((r) => (
                    <TableRow key={`${r.partner_id}-${r.currency}`}>
                      <TableCell>{partnerName(r.partner_id)}</TableCell>
                      <TableCell>{r.currency}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right font-medium">{money(r.outstanding, r.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4" /> Settlement history
            </CardTitle>
            <CardDescription>Payments made to partners and their ledger journals.</CardDescription>
          </CardHeader>
          <CardContent>
            {settlements.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No settlements recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{partnerName(s.partner_id)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.paid_at ? format(new Date(s.paid_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">{money(s.amount_paid, s.currency_code)}</TableCell>
                      <TableCell className="font-mono text-xs">{s.payment_reference || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review / approve dialog */}
      <Dialog open={!!reviewInvoice} onOpenChange={(o) => !o && setReviewInvoice(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Invoice {reviewInvoice?.invoice_number}</DialogTitle>
            <DialogDescription>
              Tick any line you want to dispute. Untick lines are approved and posted as network fees.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[45vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Dispute</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Match</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Checkbox
                        checked={disputedIds.includes(l.id)}
                        onCheckedChange={(c) =>
                          setDisputedIds((prev) => (c ? [...prev, l.id] : prev.filter((id) => id !== l.id)))
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.partner_reference || l.transfer_id || "—"}</TableCell>
                    <TableCell className="text-right">{Number(l.billed_fee ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {l.expected_fee == null ? "—" : Number(l.expected_fee).toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right ${Number(l.variance ?? 0) > 0 ? "text-destructive" : ""}`}>
                      {l.variance == null ? "—" : Number(l.variance).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.match_status === "matched" ? "secondary" : "outline"}>{l.match_status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {reviewLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      No lines on this invoice.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {disputedIds.length > 0 && (
            <div className="space-y-1">
              <Label>Dispute reason</Label>
              <Input
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g. fee billed above contracted rate"
                maxLength={500}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={approve.isPending || !reviewInvoice}
              onClick={() =>
                approve.mutate(
                  { invoice_id: reviewInvoice!.id, action: "void" },
                  { onSuccess: () => setReviewInvoice(null) },
                )
              }
            >
              Void
            </Button>
            <Button
              variant="destructive"
              disabled={approve.isPending || disputedIds.length === 0}
              onClick={() =>
                approve.mutate(
                  {
                    invoice_id: reviewInvoice!.id,
                    action: "dispute",
                    disputed_line_ids: disputedIds,
                    dispute_reason: disputeReason || undefined,
                  },
                  { onSuccess: () => setReviewInvoice(null) },
                )
              }
            >
              Raise dispute
            </Button>
            <Button
              disabled={approve.isPending || !reviewInvoice}
              onClick={() =>
                approve.mutate(
                  {
                    invoice_id: reviewInvoice!.id,
                    action: "approve",
                    disputed_line_ids: disputedIds,
                    dispute_reason: disputeReason || undefined,
                  },
                  { onSuccess: () => setReviewInvoice(null) },
                )
              }
            >
              {approve.isPending ? "Posting…" : "Approve & post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settlement dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record partner settlement</DialogTitle>
            <DialogDescription>
              Select approved invoices and the account the payment leaves from. Posts DR Partner Payables / CR funding
              account.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Partner</Label>
              <Select value={payPartner} onValueChange={(v) => { setPayPartner(v); setSelectedInvoices([]); }}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={payCurrency} onValueChange={(v) => { setPayCurrency(v); setSelectedInvoices([]); setFundingAccount(""); }}>
                <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                <SelectContent>
                  {[...new Set(invoices.filter((i) => i.status === "approved").map((i) => i.currency_code))].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border">
            {approvedForPay.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No approved invoices for this selection.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Invoice</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvedForPay.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedInvoices.includes(i.id)}
                          onCheckedChange={(c) =>
                            setSelectedInvoices((prev) => (c ? [...prev, i.id] : prev.filter((id) => id !== i.id)))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.period_start} → {i.period_end}</TableCell>
                      <TableCell className="text-right">{money(Number(i.approved_total ?? 0), i.currency_code)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Funding account</Label>
              <Select value={fundingAccount} onValueChange={setFundingAccount}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="swift">SWIFT</SelectItem>
                  <SelectItem value="stablecoin">Stablecoin</SelectItem>
                  <SelectItem value="netting">Netting / offset</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Payment reference</Label>
              <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} maxLength={200} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total to settle</span>
            <span className="font-semibold">{money(selectedTotal, payCurrency || "")}</span>
          </div>

          <DialogFooter>
            <Button
              disabled={pay.isPending}
              onClick={() => {
                if (!payPartner || !payCurrency || selectedInvoices.length === 0 || !fundingAccount) {
                  toast.error("Select partner, currency, invoices and a funding account");
                  return;
                }
                pay.mutate(
                  {
                    partner_id: payPartner,
                    currency_code: payCurrency,
                    invoice_ids: selectedInvoices,
                    funding_account_id: fundingAccount,
                    payment_method: paymentMethod,
                    payment_reference: paymentReference || undefined,
                  },
                  {
                    onSuccess: () => {
                      setPayOpen(false);
                      setSelectedInvoices([]);
                      setPaymentReference("");
                    },
                  },
                );
              }}
            >
              {pay.isPending ? "Posting…" : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerSettlementsPanel;
