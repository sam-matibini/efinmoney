import { useEffect, useMemo, useRef, useState } from "react";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import { useReconcileInvoice, useSaveStatementMapping, type InvoiceLineInput } from "@/hooks/useCostAssurance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload } from "lucide-react";
import { toast } from "sonner";

/** Fields the reconciler understands, in the order we present them for mapping. */
const TARGET_FIELDS: { key: string; label: string; required?: boolean; hints: string[] }[] = [
  { key: "billed_fee", label: "Billed fee", required: true, hints: ["fee", "charge", "commission", "cost"] },
  { key: "partner_reference", label: "Partner reference", hints: ["reference", "ref", "txn", "transaction id"] },
  { key: "transfer_id", label: "Our transfer id", hints: ["transfer", "merchant reference", "external"] },
  { key: "transaction_date", label: "Transaction date", hints: ["date", "posted", "value date"] },
  { key: "currency_code", label: "Currency", hints: ["currency", "ccy"] },
  { key: "amount", label: "Transaction amount", hints: ["amount", "value", "gross"] },
];


const NONE = "__none__";

const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};

const parseCsv = (text: string): { headers: string[]; rows: string[][] } => {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
};

const toNumber = (raw: string | undefined): number => {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.,\-()]/g, "").replace(/[(](.*)[)]/, "-$1");
  const normalised = cleaned.includes(",") && !cleaned.includes(".")
    ? cleaned.replace(/,/g, ".")
    : cleaned.replace(/,/g, "");
  const n = Number(normalised);
  return Number.isFinite(n) ? n : 0;
};

const toIsoDate = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
};

const guessMapping = (headers: string[]): Record<string, string> => {
  const used = new Set<string>();
  const mapping: Record<string, string> = {};
  for (const field of TARGET_FIELDS) {
    const hit = headers.find((h) => {
      if (used.has(h)) return false;
      const low = h.toLowerCase();
      return low === field.key || low.replace(/[_\s]/g, "") === field.key.replace(/_/g, "") ||
        field.hints.some((hint) => low.includes(hint));
    });
    if (hit) {
      mapping[field.key] = hit;
      used.add(hit);
    }
  }
  return mapping;
};

const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StatementUploadDialog = ({ open, onOpenChange }: Props) => {
  const { data: partners } = usePaymentPartners();
  const reconcile = useReconcileInvoice();
  const saveMapping = useSaveStatementMapping();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    partner_id: "",
    invoice_number: "",
    period_start: "",
    period_end: "",
    currency_code: "CAD",
  });
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true);

  const partner = partners?.find((p) => p.id === form.partner_id);

  // Apply the partner's saved mapping when it still matches the uploaded headers.
  useEffect(() => {
    if (!partner || !headers.length) return;
    const saved = (partner.statement_mapping ?? {}) as Record<string, string>;
    const usable = Object.fromEntries(
      Object.entries(saved).filter(([, col]) => headers.includes(col)),
    );
    setMapping((prev) => ({ ...guessMapping(headers), ...usable, ...prev }));
    if (partner.settlement_currency) {
      setForm((f) => (f.currency_code ? f : { ...f, currency_code: partner.settlement_currency! }));
    }
  }, [partner, headers]);

  const reset = () => {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
  };

  const onFile = async (file: File) => {
    const { headers: h, rows: r } = parseCsv(await file.text());
    if (!h.length || !r.length) {
      toast.error("No rows found in that file");
      return;
    }
    setFileName(file.name);
    setHeaders(h);
    setRows(r);
    setMapping(guessMapping(h));
  };

  const lines: InvoiceLineInput[] = useMemo(() => {
    if (!headers.length || !mapping.billed_fee) return [];
    const idx = (key: string) => {
      const col = mapping[key];
      return col ? headers.indexOf(col) : -1;
    };
    const iFee = idx("billed_fee");
    const iRef = idx("partner_reference");
    const iTransfer = idx("transfer_id");
    const iDate = idx("transaction_date");
    const iCcy = idx("currency_code");
    const iAmount = idx("amount");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    return rows
      .map((r) => {
        const transferRaw = iTransfer >= 0 ? (r[iTransfer] ?? "").trim() : "";
        return {
          billed_fee: toNumber(r[iFee]),
          partner_reference: iRef >= 0 ? (r[iRef] || null) : null,
          transfer_id: uuid.test(transferRaw) ? transferRaw : null,
          transaction_date: iDate >= 0 ? toIsoDate(r[iDate]) : null,
          currency_code: iCcy >= 0 && r[iCcy] ? r[iCcy].toUpperCase().slice(0, 10) : null,
          amount: iAmount >= 0 ? toNumber(r[iAmount]) : null,
        };
      })
      .filter((l) => l.billed_fee !== 0 || l.partner_reference || l.transfer_id);
  }, [headers, rows, mapping]);

  const billedTotal = lines.reduce((s, l) => s + l.billed_fee, 0);
  const canSubmit =
    !!form.partner_id && !!form.invoice_number && !!form.period_start && !!form.period_end &&
    !!mapping.billed_fee && lines.length > 0 && !reconcile.isPending;

  const submit = () => {
    if (remember && form.partner_id && Object.keys(mapping).length) {
      saveMapping.mutate({ partner_id: form.partner_id, mapping });
    }
    reconcile.mutate(
      { ...form, lines },
      {
        onSuccess: () => {
          onOpenChange(false);
          reset();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upload partner statement</DialogTitle>
          <DialogDescription>
            Drop the partner's statement, map its columns once, and we reconcile every line against recorded
            transaction economics.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Partner</Label>
              <Select value={form.partner_id} onValueChange={(v) => setForm({ ...form, partner_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select partner" />
                </SelectTrigger>
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
              <Label>Invoice number</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Input
                value={form.currency_code}
                onChange={(e) => setForm({ ...form, currency_code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Period start</Label>
              <Input
                type="date"
                value={form.period_start}
                onChange={(e) => setForm({ ...form, period_start: e.target.value })}
              />
            </div>
            <div>
              <Label>Period end</Label>
              <Input
                type="date"
                value={form.period_end}
                onChange={(e) => setForm({ ...form, period_end: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Statement file</Label>
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
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-1 h-4 w-4" /> Choose CSV
              </Button>
              <span className="text-xs text-muted-foreground">
                {fileName ? `${fileName} · ${rows.length} row(s)` : "Any column layout — you map it below"}
              </span>
            </div>
          </div>

          {headers.length > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Column mapping</p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={remember} onCheckedChange={(c) => setRemember(!!c)} />
                  Remember for this partner
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {TARGET_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">
                      {f.label}
                      {f.required ? " *" : ""}
                    </Label>
                    <Select
                      value={mapping[f.key] ?? NONE}
                      onValueChange={(v) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (v === NONE) delete next[f.key];
                          else next[f.key] = v;
                          return next;
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not mapped</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!mapping.billed_fee && (
                <p className="text-xs text-destructive">Map the billed fee column to continue.</p>
              )}
            </div>
          )}

          {lines.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Preview — {lines.length} line(s), billed total {money(billedTotal)} {form.currency_code}
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Ccy</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Billed fee</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.slice(0, 5).map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">
                          {l.partner_reference || l.transfer_id?.slice(0, 8) || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{l.transaction_date ?? "—"}</TableCell>
                        <TableCell className="text-xs">{l.currency_code ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.amount == null ? "—" : money(l.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(l.billed_fee)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {reconcile.isPending ? "Reconciling…" : "Upload & reconcile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StatementUploadDialog;
