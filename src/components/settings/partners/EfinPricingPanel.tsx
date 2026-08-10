import { useMemo, useRef, useState } from "react";
import { useEfinPricing, useAddEfinPricing, useRetireEfinPricing, type EfinPricing } from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Archive, Receipt, History, Pencil, Upload, FileDown } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useTableQuery, type Col } from "./tableToolkit";
import { downloadCsv, parseSpreadsheet } from "@/lib/tableExport";

const empty: Partial<EfinPricing> = {
  customer_type: "consumer",
  direction: "payout",
  source_currency: "CAD",
  dest_currency: "",
  dest_country: "",
  fixed_fee: 0,
  percentage_fee: 0,
  fx_margin_bps: 0,
};

/** Import / template columns, matching the editable fields on the form. */
const IMPORT_COLUMNS = [
  "customer_type",
  "direction",
  "source_currency",
  "dest_currency",
  "dest_country",
  "payment_method",
  "fixed_fee",
  "percentage_fee",
  "fx_margin_bps",
  "min_fee",
  "max_fee",
];

export const EfinPricingPanel = () => {
  const [history, setHistory] = useState(false);
  const { data: pricing, isLoading } = useEfinPricing(history);
  const add = useAddEfinPricing();
  const retire = useRetireEfinPricing();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<EfinPricing>>(empty);
  /** Row being superseded — retired once the new version saves. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<EfinPricing>) => setDraft((d) => ({ ...d, ...patch }));

  const openNew = () => {
    setEditingId(null);
    setDraft(empty);
    setOpen(true);
  };

  const openEdit = (p: EfinPricing) => {
    const { id, effective_from, effective_to, ...rest } = p;
    setEditingId(id);
    setDraft(rest);
    setOpen(true);
  };

  const save = () =>
    add.mutate(draft, {
      onSuccess: () => {
        if (editingId) retire.mutate(editingId);
        setEditingId(null);
        setOpen(false);
      },
    });

  const onFile = async (file: File) => {
    const rows = await parseSpreadsheet(file);
    if (!rows.length) {
      toast.error("No rows found in file");
      return;
    }
    let ok = 0;
    for (const r of rows) {
      if (!r.source_currency || !r.dest_currency) continue;
      add.mutate({
        customer_type: (r.customer_type || "consumer").toLowerCase(),
        direction: ((r.direction || "payout").toLowerCase()) as EfinPricing["direction"],
        source_currency: r.source_currency.toUpperCase(),
        dest_currency: r.dest_currency.toUpperCase(),
        dest_country: r.dest_country ? r.dest_country.toUpperCase() : null,
        payment_method: r.payment_method ? r.payment_method.toLowerCase() : null,
        fixed_fee: Number(r.fixed_fee || 0),
        percentage_fee: Number(r.percentage_fee || 0),
        fx_margin_bps: Number(r.fx_margin_bps || 0),
        min_fee: r.min_fee ? Number(r.min_fee) : null,
        max_fee: r.max_fee ? Number(r.max_fee) : null,
      });
      ok += 1;
    }
    toast.success(`Importing ${ok} pricing row${ok === 1 ? "" : "s"}`);
  };

  const cols = useMemo<Col<EfinPricing>[]>(
    () => [
      { key: "customer", label: "Customer type", value: (p) => p.customer_type, filter: true },
      {
        key: "corridor",
        label: "Corridor",
        value: (p) => `${p.direction} ${p.source_currency}→${p.dest_currency}${p.dest_country ? ` (${p.dest_country})` : ""}`,
        filter: true,
      },
      { key: "fixed", label: "Fixed", value: (p) => p.fixed_fee, type: "number", align: "right" },
      { key: "pct", label: "%", value: (p) => p.percentage_fee, type: "number", align: "right" },
      { key: "fx", label: "FX margin", value: (p) => p.fx_margin_bps, type: "number", align: "right" },
      { key: "effective", label: "Effective", value: (p) => p.effective_from, type: "date" },
      { key: "actions", label: "", value: () => "", sortable: false },
    ],
    [],
  );

  const { view, Controls, HeadRow } = useTableQuery(pricing, cols, {
    defaultSort: "effective",
    defaultDir: "desc",
    exportName: "customer-pricing",
    searchPlaceholder: "Search customer, corridor…",
  });


  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> eFinMoney Customer Pricing
            </CardTitle>
            <CardDescription>What we charge the customer — the revenue side of every profitability calculation</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <History className="h-4 w-4" />
              <Switch checked={history} onCheckedChange={setHistory} />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv("customer-pricing-template", IMPORT_COLUMNS, [])}
            >
              <FileDown className="h-4 w-4 mr-1" /> Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={add.isPending}>
              <Upload className="h-4 w-4 mr-1" /> Import
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Add pricing
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !pricing?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No customer pricing configured yet.</p>
        ) : (
          <div>
            <Controls />
            <div className="overflow-x-auto">
            <Table>
              <HeadRow />
              <TableBody>
                {view.map((p) => (
                  <TableRow key={p.id} className={p.effective_to ? "opacity-60" : ""}>
                    <TableCell className="capitalize font-medium">{p.customer_type}</TableCell>
                    <TableCell>
                      <span className="capitalize">{p.direction}</span> · {p.source_currency}→{p.dest_currency}
                      {p.dest_country ? ` (${p.dest_country})` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.fixed_fee.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.percentage_fee}%</TableCell>
                    <TableCell className="text-right tabular-nums">{p.fx_margin_bps} bps</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(p.effective_from), "dd MMM yy")}
                      {p.effective_to ? (
                        <div className="text-muted-foreground">→ {format(new Date(p.effective_to), "dd MMM yy")}</div>
                      ) : (
                        <Badge className="ml-1">current</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {!p.effective_to && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => retire.mutate(p.id)} title="Retire">
                            <Archive className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add customer pricing</DialogTitle>
            <DialogDescription>Applies from now until retired. Existing rows stay for historical reconciliation.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Customer type</Label>
              <Select value={draft.customer_type} onValueChange={(v) => set({ customer_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumer">Consumer</SelectItem>
                  <SelectItem value="sme">SME</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Direction</Label>
              <Select value={draft.direction} onValueChange={(v) => set({ direction: v as EfinPricing["direction"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payin">Pay-in</SelectItem>
                  <SelectItem value="payout">Pay-out</SelectItem>
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
              <Label>Payment method (optional)</Label>
              <Input
                value={draft.payment_method || ""}
                onChange={(e) => set({ payment_method: e.target.value.toLowerCase() || null })}
              />
            </div>
            <div>
              <Label>Fixed fee</Label>
              <Input type="number" step="0.01" value={draft.fixed_fee ?? 0} onChange={(e) => set({ fixed_fee: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Percentage fee (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.percentage_fee ?? 0}
                onChange={(e) => set({ percentage_fee: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>FX margin (bps)</Label>
              <Input
                type="number"
                step="1"
                value={draft.fx_margin_bps ?? 0}
                onChange={(e) => set({ fx_margin_bps: Number(e.target.value) })}
              />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => add.mutate(draft, { onSuccess: () => setOpen(false) })}
              disabled={!draft.source_currency || !draft.dest_currency || add.isPending}
            >
              Save pricing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EfinPricingPanel;
