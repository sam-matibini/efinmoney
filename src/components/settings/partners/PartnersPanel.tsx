import { useMemo, useRef, useState } from "react";
import { useTableQuery, type Col } from "./tableToolkit";
import { CountryCombobox, countryLabel, toCountryCode, isKnownCountry } from "./CountryCombobox";
import { ISO_COUNTRIES } from "@/lib/isoCountries";
import {
  usePaymentPartners,
  usePartnerCorridors,
  useCreatePartner,
  useUpdatePartner,
  useDeletePartner,
  type PaymentPartner,
} from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Network, AlertCircle, RefreshCw, Upload, FileDown } from "lucide-react";
import { downloadCsv, parseSpreadsheet } from "@/lib/tableExport";
import { toast } from "sonner";

const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

const statusVariant = (s: string) => (s === "active" ? "default" : s === "pending" ? "secondary" : "outline");

const normalizeCode = (v: string) =>
  v.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_{2,}/g, "_");

const TEMPLATE_HEADERS = [
  "partner_ref",
  "code",
  "name",
  "direction",
  "country",
  "regulatory_status",
  "settlement_currency",
  "settlement_time",
  "api_status",
  "integration_status",
  "compliance_risk",
  "reliability_score",
  "priority",
  "min_transaction",
  "max_transaction",
  "daily_limit",
  "monthly_limit",
  "supported_currencies",
  "supported_countries",
  "payment_methods",
  "payin_function_slug",
  "payout_function_slug",
  "quote_function_slug",
  "status",
  "notes",
] as const;

const DIRECTIONS = ["payin", "payout", "both"];
const STATUSES = ["active", "inactive", "suspended", "pending"];
const RISKS = ["low", "medium", "high"];

type ImportKind = "new" | "update" | "unchanged" | "invalid";
interface ImportRow {
  kind: ImportKind;
  reason?: string;
  code: string;
  name: string;
  payload: Partial<PaymentPartner>;
  existingId?: string;
}

const num = (v: string) => (v === "" || v === undefined ? null : Number(v));

const buildImportRows = (raw: Record<string, string>[], existing: PaymentPartner[]): ImportRow[] => {
  const byCode = new Map(existing.map((p) => [p.code.toLowerCase(), p]));
  const seen = new Set<string>();
  return raw.map((r) => {
    const code = normalizeCode(String(r.code ?? "").trim());
    const name = String(r.name ?? "").trim();
    const invalid = (reason: string): ImportRow => ({ kind: "invalid", reason, code, name, payload: {} });
    if (!code || !name) return invalid("Code and name are required");
    if (seen.has(code)) return invalid("Duplicate code in file");
    seen.add(code);
    const direction = (r.direction || "both").trim().toLowerCase();
    if (!DIRECTIONS.includes(direction)) return invalid(`Invalid direction "${direction}"`);
    const status = (r.status || "active").trim().toLowerCase();
    if (!STATUSES.includes(status)) return invalid(`Invalid status "${status}"`);
    const risk = (r.compliance_risk || "low").trim().toLowerCase();
    if (!RISKS.includes(risk)) return invalid(`Invalid compliance risk "${risk}"`);
    if (!isKnownCountry(r.country)) return invalid(`Unknown country "${String(r.country).trim()}"`);
    for (const k of ["reliability_score", "priority", "min_transaction", "max_transaction", "daily_limit", "monthly_limit"]) {
      const v = String(r[k] ?? "").trim();
      if (v !== "" && Number.isNaN(Number(v))) return invalid(`"${k}" must be a number`);
    }
    const payload: Partial<PaymentPartner> = {
      code,
      name,
      direction: direction as PaymentPartner["direction"],
      status: status as PaymentPartner["status"],
      compliance_risk: risk as PaymentPartner["compliance_risk"],
      country: toCountryCode(r.country),
      regulatory_status: r.regulatory_status?.trim() || null,
      settlement_currency: r.settlement_currency?.trim().toUpperCase() || null,
      settlement_time: r.settlement_time?.trim() || null,
      api_status: (r.api_status?.trim().toLowerCase() || "pending") as PaymentPartner["api_status"],
      integration_status: (r.integration_status?.trim().toLowerCase() || "pending") as PaymentPartner["integration_status"],
      reliability_score: Number(String(r.reliability_score ?? "").trim() || 100),
      priority: Number(String(r.priority ?? "").trim() || 100),
      min_transaction: num(String(r.min_transaction ?? "").trim()),
      max_transaction: num(String(r.max_transaction ?? "").trim()),
      daily_limit: num(String(r.daily_limit ?? "").trim()),
      monthly_limit: num(String(r.monthly_limit ?? "").trim()),
      supported_currencies: csv(String(r.supported_currencies ?? "").toUpperCase()),
      supported_countries: csv(String(r.supported_countries ?? "").toUpperCase()),
      payment_methods: csv(String(r.payment_methods ?? "").toLowerCase()),
      payin_function_slug: r.payin_function_slug?.trim() || null,
      payout_function_slug: r.payout_function_slug?.trim() || null,
      quote_function_slug: r.quote_function_slug?.trim() || null,
      notes: r.notes?.trim() || null,
    };
    const match = byCode.get(code);
    if (!match) return { kind: "new", code, name, payload };
    const changed = Object.entries(payload).some(([k, v]) => {
      const cur = (match as unknown as Record<string, unknown>)[k];
      if (Array.isArray(v)) return JSON.stringify(v) !== JSON.stringify(cur ?? []);
      return String(v ?? "") !== String(cur ?? "");
    });
    return { kind: changed ? "update" : "unchanged", code, name, payload, existingId: match.id };
  });
};


const emptyPartner: Partial<PaymentPartner> = {
  code: "",
  name: "",
  direction: "both",
  status: "active",
  api_status: "pending",
  integration_status: "pending",
  reliability_score: 100,
  compliance_risk: "low",
  priority: 100,
  supported_currencies: [],
  supported_countries: [],
  payment_methods: [],
};

const ISO_CODES = ISO_COUNTRIES.map((c) => c.code);

export const PartnersPanel = () => {
  const { data: partners, isLoading, isError, error, refetch, isFetching } = usePaymentPartners();
  const { data: corridors } = usePartnerCorridors();
  const create = useCreatePartner();
  const update = useUpdatePartner();
  const remove = useDeletePartner();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<PaymentPartner>>(emptyPartner);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<PaymentPartner>) => setDraft((d) => ({ ...d, ...patch }));

  const codeTaken =
    !draft.id &&
    !!draft.code &&
    (partners ?? []).some((p) => p.code.toLowerCase() === String(draft.code).toLowerCase());

  /** partner id → destination countries it actually serves (from enabled/known corridors). */
  const serves = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of corridors ?? []) {
      const dest = (c.dest_country || "").toUpperCase();
      if (!dest) continue;
      const list = map.get(c.partner_id) ?? [];
      if (!list.includes(dest)) list.push(dest);
      map.set(c.partner_id, list);
    }
    for (const [k, v] of map) map.set(k, v.sort());
    return map;
  }, [corridors]);

  const cols = useMemo<Col<PaymentPartner>[]>(
    () => [
      { key: "name", label: "Partner", value: (p) => p.name, filter: true },
      { key: "code", label: "Code", value: (p) => p.code },
      { key: "direction", label: "Direction", value: (p) => p.direction, filter: true },
      {
        key: "country",
        label: "Country",
        value: (p) => p.country ?? "",
        filter: true,
        filterOptions: ISO_CODES,
        filterLabel: countryLabel,
      },
      {
        key: "serves",
        label: "Serves",
        value: (p) => (serves.get(p.id) ?? []).join(", "),
        filter: true,
        filterMode: "includes",
        filterOptions: ISO_CODES,
        filterLabel: countryLabel,
      },
      { key: "settlement", label: "Settlement", value: (p) => p.settlement_currency ?? "", filter: true },
      { key: "reliability", label: "Reliability", value: (p) => p.reliability_score, type: "number", align: "right" },
      { key: "priority", label: "Priority", value: (p) => p.priority, type: "number", align: "right" },
      { key: "status", label: "Status", value: (p) => p.status, filter: true },
      { key: "actions", label: "", value: () => "", sortable: false },
    ],
    [serves],
  );

  const { view, Controls, HeadRow } = useTableQuery(partners, cols, {
    defaultSort: "priority",
    defaultDir: "asc",
    exportName: "payment-partners",
    searchPlaceholder: "Search partner, code, country…",
  });

  const save = () => {
    if (!draft.code || !draft.name || codeTaken) return;
    if (draft.id) {
      const { id, created_at, updated_at, ...patch } = draft as PaymentPartner;
      update.mutate({ id, patch }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate({ ...draft, code: normalizeCode(String(draft.code)) }, { onSuccess: () => setOpen(false) });
    }
  };

  const downloadTemplate = () =>
    downloadCsv("payment-partners-template", [...TEMPLATE_HEADERS], [
      [
        "nomba",
        "Nomba",
        "both",
        "NG",
        "CBN licensed PSP",
        "NGN",
        "minutes",
        "active",
        "active",
        "low",
        96,
        10,
        "",
        "",
        "",
        "",
        "NGN, USD",
        "NG",
        "bank, card",
        "nomba-initiate-payment",
        "nomba-payout",
        "nomba-exchange-rate",
        "active",
        "",
      ],
    ]);

  const pickFile = async (file: File) => {
    try {
      const raw = await parseSpreadsheet(file);
      if (!raw.length) {
        toast.error("That file has no rows");
        return;
      }
      setImportRows(buildImportRows(raw, partners ?? []));
      setImportOpen(true);
    } catch {
      toast.error("Could not read that file. Use the CSV/XLSX template.");
    }
  };

  const applyImport = async () => {
    const apply = importRows.filter((r) => r.kind === "new" || r.kind === "update");
    if (!apply.length) return;
    setImporting(true);
    let ok = 0;
    let failed = 0;
    for (const r of apply) {
      try {
        if (r.existingId) await update.mutateAsync({ id: r.existingId, patch: r.payload });
        else await create.mutateAsync(r.payload);
        ok++;
      } catch {
        failed++;
      }
    }
    setImporting(false);
    setImportOpen(false);
    setImportRows([]);
    refetch();
    toast[failed ? "warning" : "success"](
      failed ? `${ok} partners saved, ${failed} failed` : `${ok} partners saved`,
    );
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" /> Payment Partners
          </CardTitle>
          <CardDescription>Pay-in and pay-out providers available to the routing engine</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileDown className="h-4 w-4 mr-1" /> Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setDraft(emptyPartner);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add partner
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="alert">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium">Unable to load payment partners</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "The partner data request failed."}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        ) : !partners?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No partners yet. Add your first pay-in or pay-out provider.
          </p>
        ) : (
          <div>
            <Controls />
            <div className="overflow-x-auto">
            <Table>
              <HeadRow />
              <TableBody>
                {view.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.code}</TableCell>

                    <TableCell className="capitalize">{p.direction}</TableCell>
                    <TableCell>{p.country ? countryLabel(p.country) : "—"}</TableCell>
                    <TableCell className="max-w-[220px]">
                      {(serves.get(p.id) ?? []).length ? (
                        <div className="flex flex-wrap gap-1">
                          {(serves.get(p.id) ?? []).map((c) => (
                            <Badge key={c} variant="outline" className="font-mono text-[10px]" title={countryLabel(c)}>
                              {c}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {p.settlement_currency || "—"}
                      <div className="text-xs text-muted-foreground">{p.settlement_time || ""}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.reliability_score}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.priority}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(p.status)} className="capitalize">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDraft(p);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit partner" : "Add partner"}</DialogTitle>
            <DialogDescription>
              Routing eligibility, limits and execution routes are all driven by these values.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>
                Partner code <span className="text-destructive">*</span>
              </Label>
              <Input
                value={draft.code || ""}
                readOnly={!!draft.id}
                onChange={(e) => set({ code: normalizeCode(e.target.value) })}
                placeholder="flutterwave"
                className={draft.id ? "bg-muted" : ""}
              />
              <p className={`mt-1 text-xs ${codeTaken ? "text-destructive" : "text-muted-foreground"}`}>
                {codeTaken
                  ? "That code is already in use."
                  : draft.id
                    ? "Locked — routing and edge functions look this partner up by code."
                    : "Lowercase, letters, numbers, - and _ only."}
              </p>
            </div>

            <div>
              <Label>Name</Label>
              <Input value={draft.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder="Flutterwave" />
            </div>
            <div>
              <Label>Direction</Label>
              <Select value={draft.direction} onValueChange={(v) => set({ direction: v as PaymentPartner["direction"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payin">Pay-in</SelectItem>
                  <SelectItem value="payout">Pay-out</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Operating country</Label>
              <CountryCombobox
                value={draft.country}
                onChange={(code) => set({ country: code })}
                placeholder="Select country"
                className="mt-0.5 h-10"
              />
            </div>
            <div>
              <Label>Regulatory status</Label>
              <Input
                value={draft.regulatory_status || ""}
                onChange={(e) => set({ regulatory_status: e.target.value })}
                placeholder="CBN licensed PSP"
              />
            </div>
            <div>
              <Label>Settlement currency</Label>
              <Input
                value={draft.settlement_currency || ""}
                onChange={(e) => set({ settlement_currency: e.target.value.toUpperCase() })}
                placeholder="NGN"
              />
            </div>
            <div>
              <Label>Settlement time</Label>
              <Input
                value={draft.settlement_time || ""}
                onChange={(e) => set({ settlement_time: e.target.value })}
                placeholder="Instant / T+1"
              />
            </div>
            <div>
              <Label>API status</Label>
              <Select value={draft.api_status} onValueChange={(v) => set({ api_status: v as PaymentPartner["api_status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Integration status</Label>
              <Select
                value={draft.integration_status}
                onValueChange={(v) => set({ integration_status: v as PaymentPartner["integration_status"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Connected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Not connected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Compliance risk</Label>
              <Select
                value={draft.compliance_risk}
                onValueChange={(v) => set({ compliance_risk: v as PaymentPartner["compliance_risk"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reliability score (0–100)</Label>
              <Input
                type="number"
                value={draft.reliability_score ?? 100}
                onChange={(e) => set({ reliability_score: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Routing priority</Label>
              <Input type="number" value={draft.priority ?? 100} onChange={(e) => set({ priority: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Min transaction</Label>
              <Input
                type="number"
                value={draft.min_transaction ?? ""}
                onChange={(e) => set({ min_transaction: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Max transaction</Label>
              <Input
                type="number"
                value={draft.max_transaction ?? ""}
                onChange={(e) => set({ max_transaction: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Daily limit</Label>
              <Input
                type="number"
                value={draft.daily_limit ?? ""}
                onChange={(e) => set({ daily_limit: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Monthly limit</Label>
              <Input
                type="number"
                value={draft.monthly_limit ?? ""}
                onChange={(e) => set({ monthly_limit: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Supported currencies (comma separated)</Label>
              <Input
                value={(draft.supported_currencies || []).join(", ")}
                onChange={(e) => set({ supported_currencies: csv(e.target.value.toUpperCase()) })}
                placeholder="CAD, USD, NGN"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Supported countries (comma separated)</Label>
              <Input
                value={(draft.supported_countries || []).join(", ")}
                onChange={(e) => set({ supported_countries: csv(e.target.value.toUpperCase()) })}
                placeholder="CA, NG, ZM"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Payment methods (comma separated)</Label>
              <Input
                value={(draft.payment_methods || []).join(", ")}
                onChange={(e) => set({ payment_methods: csv(e.target.value.toLowerCase()) })}
                placeholder="bank, mobile_money, card, wallet"
              />
            </div>
            <div>
              <Label>Pay-in function</Label>
              <Input
                value={draft.payin_function_slug || ""}
                onChange={(e) => set({ payin_function_slug: e.target.value })}
                placeholder="flw-initialize-payment"
              />
            </div>
            <div>
              <Label>Pay-out function</Label>
              <Input
                value={draft.payout_function_slug || ""}
                onChange={(e) => set({ payout_function_slug: e.target.value })}
                placeholder="flutterwave-payout"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Live quote function (optional)</Label>
              <Input
                value={draft.quote_function_slug || ""}
                onChange={(e) => set({ quote_function_slug: e.target.value })}
                placeholder="nomba-exchange-rate"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={draft.notes || ""} onChange={(e) => set({ notes: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => set({ status: v as PaymentPartner["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={create.isPending || update.isPending || codeTaken || !draft.code || !draft.name}
            >
              Save partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import partners</DialogTitle>
            <DialogDescription>
              Nothing is written until you apply. Invalid rows are never applied.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 text-xs">
            {(["new", "update", "unchanged", "invalid"] as ImportKind[]).map((k) => (
              <Badge key={k} variant={k === "invalid" ? "destructive" : "secondary"} className="capitalize">
                {k}: {importRows.filter((r) => r.kind === k).length}
              </Badge>
            ))}
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((r, i) => (
                  <TableRow key={`${r.code}-${i}`}>
                    <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                    <TableCell>{r.name || "—"}</TableCell>
                    <TableCell className="capitalize">{r.payload.direction || "—"}</TableCell>
                    <TableCell>{r.payload.country || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.kind === "invalid" ? "destructive" : "secondary"} className="capitalize">
                        {r.kind}
                      </Badge>
                      {r.reason && <span className="ml-2 text-xs text-muted-foreground">{r.reason}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={applyImport}
              disabled={importing || !importRows.some((r) => r.kind === "new" || r.kind === "update")}
            >
              Apply {importRows.filter((r) => r.kind === "new" || r.kind === "update").length} rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>

  );
};

export default PartnersPanel;
