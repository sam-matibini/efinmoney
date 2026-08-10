import { useMemo, useRef, useState } from "react";
import { useTableQuery, type Col } from "./tableToolkit";
import {
  usePaymentPartners,
  usePartnerPricing,
  useAddPartnerPricing,
  useBulkAddPartnerPricing,
  type PartnerPricing,
} from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, Tags, History, Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const CSV_COLUMNS = [
  "partner_code",
  "direction",
  "source_currency",
  "dest_currency",
  "dest_country",
  "payment_method",
  "fee_type",
  "fixed_fee",
  "percentage_fee",
  "min_fee",
  "max_fee",
  "fx_markup_bps",
  "settlement_fee",
  "network_fee",
  "compliance_fee",
];

const empty: Partial<PartnerPricing> = {
  direction: "payout",
  source_currency: "CAD",
  dest_currency: "",
  dest_country: "",
  payment_method: "bank",
  fee_type: "hybrid",
  fixed_fee: 0,
  percentage_fee: 0,
  fx_markup_bps: 0,
  settlement_fee: 0,
  network_fee: 0,
  compliance_fee: 0,
  source: "manual",
};

const parseCsv = (text: string): Record<string, string>[] => {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
};

export const PartnerPricingPanel = () => {
  const { data: partners } = usePaymentPartners();
  const [partnerId, setPartnerId] = useState("");
  const [history, setHistory] = useState(false);
  const { data: pricing, isLoading } = usePartnerPricing({
    partnerId: partnerId || undefined,
    includeHistory: history,
  });
  const add = useAddPartnerPricing();
  const bulk = useBulkAddPartnerPricing();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<PartnerPricing>>(empty);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<PartnerPricing>) => setDraft((d) => ({ ...d, ...patch }));

  const byCode = useMemo(() => {
    const m = new Map<string, string>();
    partners?.forEach((p) => m.set(p.code.toLowerCase(), p.id));
    return m;
  }, [partners]);

  const nameOf = (id: string) => partners?.find((p) => p.id === id)?.name || "—";

  const cols = useMemo<Col<PartnerPricing>[]>(
    () => [
      { key: "partner", label: "Partner", value: (p) => nameOf(p.partner_id), filter: true },
      {
        key: "route",
        label: "Route",
        value: (p) => `${p.direction} ${p.source_currency}→${p.dest_currency}${p.dest_country ? ` (${p.dest_country})` : ""} ${p.payment_method}`,
      },
      { key: "fixed", label: "Fixed", value: (p) => p.fixed_fee, type: "number", align: "right" },
      { key: "pct", label: "%", value: (p) => p.percentage_fee, type: "number", align: "right" },
      { key: "fx", label: "FX bps", value: (p) => p.fx_markup_bps, type: "number", align: "right" },
      {
        key: "other",
        label: "Other fees",
        value: (p) => p.settlement_fee + p.network_fee + p.compliance_fee,
        type: "number",
        align: "right",
      },
      { key: "effective", label: "Effective", value: (p) => p.effective_from, type: "date" },
      { key: "source", label: "Source", value: (p) => p.source, filter: true },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partners],
  );

  const { view, Controls, HeadRow } = useTableQuery(pricing, cols, {
    defaultSort: "effective",
    defaultDir: "desc",
    exportName: "partner-pricing",
    searchPlaceholder: "Search partner, route, method…",
  });

  const onFile = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (!rows.length) {
      toast.error("No rows found in file");
      return;
    }
    const mapped: Partial<PartnerPricing>[] = [];
    const skipped: string[] = [];
    rows.forEach((r, i) => {
      const pid = byCode.get((r.partner_code || "").toLowerCase());
      if (!pid) {
        skipped.push(`row ${i + 2}: unknown partner "${r.partner_code}"`);
        return;
      }
      mapped.push({
        partner_id: pid,
        direction: (r.direction || "payout") as PartnerPricing["direction"],
        source_currency: (r.source_currency || "").toUpperCase(),
        dest_currency: (r.dest_currency || "").toUpperCase(),
        dest_country: (r.dest_country || "").toUpperCase() || null,
        payment_method: (r.payment_method || "bank").toLowerCase(),
        fee_type: (r.fee_type || "hybrid") as PartnerPricing["fee_type"],
        fixed_fee: Number(r.fixed_fee || 0),
        percentage_fee: Number(r.percentage_fee || 0),
        min_fee: r.min_fee ? Number(r.min_fee) : null,
        max_fee: r.max_fee ? Number(r.max_fee) : null,
        fx_markup_bps: Number(r.fx_markup_bps || 0),
        settlement_fee: Number(r.settlement_fee || 0),
        network_fee: Number(r.network_fee || 0),
        compliance_fee: Number(r.compliance_fee || 0),
        source_reference: file.name,
      });
    });
    if (skipped.length) toast.warning(`${skipped.length} row(s) skipped: ${skipped[0]}`);
    if (mapped.length) bulk.mutate(mapped);
  };

  const downloadCsv = (filename: string, body: string) => {
    const blob = new Blob([body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const rows = pricing ?? [];
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    const codeById = new Map(partners?.map((p) => [p.id, p.code]) ?? []);
    const lines = rows.map((p) =>
      [
        codeById.get(p.partner_id) ?? "",
        p.direction,
        p.source_currency,
        p.dest_currency,
        p.dest_country ?? "",
        p.payment_method,
        p.fee_type,
        p.fixed_fee,
        p.percentage_fee,
        p.min_fee ?? "",
        p.max_fee ?? "",
        p.fx_markup_bps,
        p.settlement_fee,
        p.network_fee,
        p.compliance_fee,
      ].join(","),
    );
    downloadCsv("partner-pricing.csv", [CSV_COLUMNS.join(","), ...lines].join("\n"));
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" /> Partner Pricing
            </CardTitle>
            <CardDescription>
              Versioned partner fee schedules. Saving a new price supersedes the previous version — nothing is overwritten.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <History className="h-4 w-4" />
              <span>History</span>
              <Switch checked={history} onCheckedChange={setHistory} />
            </div>
            <Select value={partnerId || "all"} onValueChange={(v) => setPartnerId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All partners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All partners</SelectItem>
                {partners?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => downloadCsv("partner-pricing-template.csv", `${CSV_COLUMNS.join(",")}\n`)}>
              <FileDown className="h-4 w-4 mr-1" /> Template
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={bulk.isPending}>
              <Upload className="h-4 w-4 mr-1" /> Import CSV
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDraft({ ...empty, partner_id: partnerId || partners?.[0]?.id });
                setOpen(true);
              }}
              disabled={!partners?.length}
            >
              <Plus className="h-4 w-4 mr-1" /> New version
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          CSV columns: {CSV_COLUMNS.join(", ")}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !pricing?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No pricing recorded yet.</p>
        ) : (
          <div>
            <Controls />
            <div className="overflow-x-auto">
            <Table>
              <HeadRow />
              <TableBody>
                {view.map((p) => (
                  <TableRow key={p.id} className={p.effective_to ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{nameOf(p.partner_id)}</TableCell>
                    <TableCell>
                      <span className="capitalize">{p.direction}</span> · {p.source_currency}→{p.dest_currency}
                      {p.dest_country ? ` (${p.dest_country})` : ""}
                      <div className="text-xs text-muted-foreground capitalize">{p.payment_method.replace(/_/g, " ")}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.fixed_fee.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.percentage_fee}%</TableCell>
                    <TableCell className="text-right tabular-nums">{p.fx_markup_bps}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(p.settlement_fee + p.network_fee + p.compliance_fee).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(p.effective_from), "dd MMM yy HH:mm")}
                      {p.effective_to ? (
                        <div className="text-muted-foreground">→ {format(new Date(p.effective_to), "dd MMM yy HH:mm")}</div>
                      ) : (
                        <Badge variant="default" className="ml-1">current</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{p.source.replace(/_/g, " ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New pricing version</DialogTitle>
            <DialogDescription>The current version for this route will be closed off automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Partner</Label>
              <Select value={draft.partner_id} onValueChange={(v) => set({ partner_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  {partners?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Direction</Label>
              <Select value={draft.direction} onValueChange={(v) => set({ direction: v as PartnerPricing["direction"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payin">Pay-in</SelectItem>
                  <SelectItem value="payout">Pay-out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fee type</Label>
              <Select value={draft.fee_type} onValueChange={(v) => set({ fee_type: v as PartnerPricing["fee_type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="hybrid">Fixed + percentage</SelectItem>
                  <SelectItem value="tiered">Tiered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source currency</Label>
              <Input value={draft.source_currency || ""} onChange={(e) => set({ source_currency: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Destination currency</Label>
              <Input value={draft.dest_currency || ""} onChange={(e) => set({ dest_currency: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Destination country</Label>
              <Input value={draft.dest_country || ""} onChange={(e) => set({ dest_country: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Payment method</Label>
              <Input value={draft.payment_method || ""} onChange={(e) => set({ payment_method: e.target.value.toLowerCase() })} />
            </div>
            <div>
              <Label>Fixed fee</Label>
              <Input type="number" step="0.01" value={draft.fixed_fee ?? 0} onChange={(e) => set({ fixed_fee: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Percentage fee (%)</Label>
              <Input type="number" step="0.01" value={draft.percentage_fee ?? 0} onChange={(e) => set({ percentage_fee: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Minimum fee</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.min_fee ?? ""}
                onChange={(e) => set({ min_fee: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Maximum fee</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.max_fee ?? ""}
                onChange={(e) => set({ max_fee: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>FX markup (bps)</Label>
              <Input type="number" step="1" value={draft.fx_markup_bps ?? 0} onChange={(e) => set({ fx_markup_bps: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Settlement fee</Label>
              <Input type="number" step="0.01" value={draft.settlement_fee ?? 0} onChange={(e) => set({ settlement_fee: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Network fee</Label>
              <Input type="number" step="0.01" value={draft.network_fee ?? 0} onChange={(e) => set({ network_fee: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Compliance fee</Label>
              <Input type="number" step="0.01" value={draft.compliance_fee ?? 0} onChange={(e) => set({ compliance_fee: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Fee currency</Label>
              <Input value={draft.fee_currency || ""} onChange={(e) => set({ fee_currency: e.target.value.toUpperCase() })} placeholder="CAD" />
            </div>
            <div>
              <Label>Source</Label>
              <Select value={draft.source} onValueChange={(v) => set({ source: v as PartnerPricing["source"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="api">Partner API</SelectItem>
                  <SelectItem value="partner_portal">Partner portal</SelectItem>
                  <SelectItem value="file">File upload</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => add.mutate(draft, { onSuccess: () => setOpen(false) })}
              disabled={!draft.partner_id || !draft.source_currency || !draft.dest_currency || add.isPending}
            >
              Save version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PartnerPricingPanel;
