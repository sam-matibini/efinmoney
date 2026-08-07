import { useState } from "react";
import { Tags, Plus, Trash2, Loader2, Save, X, AlertTriangle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  usePricingRules, useCreatePricingRule, useUpdatePricingRule, useDeletePricingRule,
  type PricingRule, type NewPricingRule,
} from "@/hooks/usePricingRules";

const PAYOUT_METHODS = ["bank", "mobile_money", "interac", "cash", "wallet"];

const PAYOUT_LABELS: Record<string, string> = {
  bank: "Bank transfer",
  mobile_money: "Mobile money",
  interac: "Interac e-Transfer",
  cash: "Cash pickup",
  wallet: "Wallet",
};

const SOURCE_CURRENCIES = [
  { code: "CAD", shortName: "Canada", label: "CAD — Canadian Dollar" },
  { code: "USD", shortName: "USA",    label: "USD — US Dollar" },
  { code: "GBP", shortName: "UK",     label: "GBP — British Pound" },
  { code: "EUR", shortName: "Europe", label: "EUR — Euro" },
];

const DEST_COUNTRIES = [
  { code: "NG", name: "Nigeria",        currency: "NGN", flag: "🇳🇬" },
  { code: "GH", name: "Ghana",          currency: "GHS", flag: "🇬🇭" },
  { code: "ZM", name: "Zambia",         currency: "ZMW", flag: "🇿🇲" },
  { code: "KE", name: "Kenya",          currency: "KES", flag: "🇰🇪" },
  { code: "UG", name: "Uganda",         currency: "UGX", flag: "🇺🇬" },
  { code: "TZ", name: "Tanzania",       currency: "TZS", flag: "🇹🇿" },
  { code: "SN", name: "Senegal",        currency: "XOF", flag: "🇸🇳" },
  { code: "CI", name: "Côte d'Ivoire",  currency: "XOF", flag: "🇨🇮" },
  { code: "CM", name: "Cameroon",       currency: "XAF", flag: "🇨🇲" },
];

function genLabel(src: string, country: string, payout: string): string {
  const srcData = SOURCE_CURRENCIES.find((c) => c.code === src);
  const dest = DEST_COUNTRIES.find((d) => d.code === country);
  if (!srcData || !dest || !payout) return "";
  return `${srcData.shortName} → ${dest.name} (${PAYOUT_LABELS[payout] ?? payout})`;
}

const EMPTY: NewPricingRule = {
  name: "", source_currency: "CAD", dest_country: "NG", dest_currency: "NGN",
  payout_method: "bank", fee_percent: 1.5, fee_fixed: 2.99, fx_markup_percent: 1,
  min_amount: 5, max_amount: 10000, enabled: true,
};

export default function PricingPage() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading, isFetching } = usePricingRules();
  const create = useCreatePricingRule();
  const del = useDeletePricingRule();
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<NewPricingRule>(EMPTY);

  const submitNew = async () => {
    if (!draft.source_currency.trim() || !draft.dest_currency.trim() || !draft.dest_country.trim()) {
      toast.error("Source, destination country and currency are required");
      return;
    }
    try {
      await create.mutateAsync({
        ...draft,
        source_currency: draft.source_currency.toUpperCase(),
        dest_country: draft.dest_country.toUpperCase(),
        dest_currency: draft.dest_currency.toUpperCase(),
      });
      toast.success("Pricing rule added");
      setAddOpen(false);
      setDraft(EMPTY);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Tags className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-bold">Pricing</h1>
            <p className="text-sm text-muted-foreground">Fees, FX markup and corridors — managed per route</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => qc.invalidateQueries({ queryKey: ["pricing_rules"] })}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Add corridor</Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New pricing rule</DialogTitle></DialogHeader>
            <RuleForm value={draft} onChange={setDraft} existingRules={rules} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={submitNew} disabled={create.isPending} className="gap-2">
                {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <TopScrollSync>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Corridor</th>
                <th className="text-right font-semibold px-3 py-3">Fee %</th>
                <th className="text-right font-semibold px-3 py-3">Fee $</th>
                <th className="text-right font-semibold px-3 py-3">FX markup %</th>
                <th className="text-right font-semibold px-3 py-3">Limits</th>
                <th className="text-center font-semibold px-3 py-3">Live</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : rules.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No pricing rules yet. Add your first corridor.</td></tr>
              ) : (
                rules.map((r) => <RuleRow key={r.id} rule={r} onDelete={() => del.mutate(r.id, { onError: (e) => toast.error((e as Error).message) })} />)
              )}
            </tbody>
          </table>
        </TopScrollSync>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Live corridors are active — fees and FX markup apply immediately to user transfer quotes. Toggle Live off to revert a corridor to global defaults.
      </p>
    </div>
  );
}

/* ── Editable row ───────────────────────────────────────────────────────── */
function RuleRow({ rule, onDelete }: { rule: PricingRule; onDelete: () => void }) {
  const update = useUpdatePricingRule();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PricingRule>(rule);

  const save = async () => {
    try {
      await update.mutateAsync({
        id: rule.id,
        patch: {
          name: draft.name,
          fee_percent: Number(draft.fee_percent),
          fee_fixed: Number(draft.fee_fixed),
          fx_markup_percent: Number(draft.fx_markup_percent),
          min_amount: Number(draft.min_amount),
          max_amount: Number(draft.max_amount),
        },
      });
      toast.success("Saved");
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const num = (k: keyof PricingRule, w = "w-20") => (
    <Input
      type="number" step="0.01" className={`${w} h-8 ml-auto text-right`}
      value={String(draft[k] ?? "")}
      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value as any }))}
    />
  );

  if (editing) {
    return (
      <tr className="bg-muted/20">
        <td className="px-4 py-2.5">
          <div className="font-medium">{rule.source_currency} → {rule.dest_currency} <span className="text-muted-foreground">({rule.dest_country})</span></div>
          <Input className="h-8 mt-1 max-w-[220px]" placeholder="Label (optional)"
            value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </td>
        <td className="px-3 py-2.5">{num("fee_percent")}</td>
        <td className="px-3 py-2.5">{num("fee_fixed")}</td>
        <td className="px-3 py-2.5">{num("fx_markup_percent")}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1 justify-end">
            {num("min_amount", "w-16")}<span className="text-muted-foreground">–</span>{num("max_amount", "w-20")}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <Switch checked={draft.enabled} onCheckedChange={(v) => update.mutate({ id: rule.id, patch: { enabled: v } })} />
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1 justify-end">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={save} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-emerald-600" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setDraft(rule); setEditing(false); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium">{rule.source_currency} → {rule.dest_currency} <span className="text-muted-foreground">({rule.dest_country})</span></div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
          {rule.name && <span className="truncate max-w-[200px]">{rule.name}</span>}
          <Badge variant="outline" className="text-[10px]">{rule.payout_method}</Badge>
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{rule.fee_percent}%</td>
      <td className="px-3 py-3 text-right tabular-nums">{rule.fee_fixed.toFixed(2)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{rule.fx_markup_percent}%</td>
      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{rule.min_amount}–{rule.max_amount}</td>
      <td className="px-3 py-3 text-center">
        <Switch checked={rule.enabled} disabled={update.isPending}
          onCheckedChange={(v) => update.mutate({ id: rule.id, patch: { enabled: v } }, { onError: (e) => toast.error((e as Error).message) })} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1 justify-end">
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setDraft(rule); setEditing(true); }}>Edit</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this pricing rule?</AlertDialogTitle>
                <AlertDialogDescription>
                  {rule.source_currency} → {rule.dest_currency} ({rule.dest_country}, {rule.payout_method}) will be removed. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}

/* ── Add form ───────────────────────────────────────────────────────────── */
function RuleForm({
  value,
  onChange,
  existingRules = [],
}: {
  value: NewPricingRule;
  onChange: (v: NewPricingRule) => void;
  existingRules?: PricingRule[];
}) {
  const setNum = (k: keyof NewPricingRule) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value === "" ? 0 : Number(e.target.value) });

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );

  const autoUpdateLabel = (next: Partial<NewPricingRule>) => {
    const merged = { ...value, ...next };
    const currentAuto = genLabel(value.source_currency, value.dest_country, value.payout_method);
    const name = !value.name || value.name === currentAuto
      ? genLabel(merged.source_currency, merged.dest_country, merged.payout_method)
      : value.name;
    return { ...merged, name };
  };

  const median = (arr: number[]) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const suggestFromExisting = (destCountry: string) => {
    const matches = existingRules.filter((r) => r.dest_country === destCountry);
    if (!matches.length) return null;
    return {
      fee_percent:       median(matches.map((r) => r.fee_percent))       ?? value.fee_percent,
      fee_fixed:         median(matches.map((r) => r.fee_fixed))         ?? value.fee_fixed,
      fx_markup_percent: median(matches.map((r) => r.fx_markup_percent)) ?? value.fx_markup_percent,
    };
  };

  const handleSourceChange = (src: string) =>
    onChange(autoUpdateLabel({ source_currency: src }));

  const handleDestChange = (code: string) => {
    const dest = DEST_COUNTRIES.find((d) => d.code === code);
    if (!dest) return;
    const base = autoUpdateLabel({ dest_country: code, dest_currency: dest.currency });
    const suggestion = suggestFromExisting(code);
    onChange(suggestion ? { ...base, ...suggestion } : base);
  };

  const handlePayoutChange = (payout: string) =>
    onChange(autoUpdateLabel({ payout_method: payout }));

  const destInfo = DEST_COUNTRIES.find((d) => d.code === value.dest_country);

  const isDuplicate = existingRules.some(
    (r) =>
      r.source_currency === value.source_currency &&
      r.dest_country === value.dest_country &&
      r.payout_method === value.payout_method,
  );

  return (
    <div className="space-y-4">
      <Field label="Label (optional)">
        <Input
          value={value.name ?? ""}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder={genLabel(value.source_currency, value.dest_country, value.payout_method) || "e.g. Canada → Nigeria (bank)"}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Source currency">
          <Select value={value.source_currency} onValueChange={handleSourceChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCE_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Destination country">
          <Select value={value.dest_country} onValueChange={handleDestChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEST_COUNTRIES.map((d) => (
                <SelectItem key={d.code} value={d.code}>
                  {d.flag} {d.name} ({d.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {destInfo && (
        <p className="text-xs text-muted-foreground -mt-1">
          Payout currency: <span className="font-semibold text-foreground">{destInfo.currency}</span> — set automatically from country
          {suggestFromExisting(value.dest_country) && (
            <span className="ml-2 text-primary">· Rates auto-filled from existing {destInfo.name} corridors</span>
          )}
        </p>
      )}

      <Field label="Payout method">
        <Select value={value.payout_method} onValueChange={handlePayoutChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAYOUT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>{PAYOUT_LABELS[m] ?? m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {isDuplicate && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          A rule for this exact corridor + payout method already exists. Adding another may cause conflicts.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="Fee %"><Input type="number" step="0.01" value={String(value.fee_percent)} onChange={setNum("fee_percent")} /></Field>
        <Field label="Fee $"><Input type="number" step="0.01" value={String(value.fee_fixed)} onChange={setNum("fee_fixed")} /></Field>
        <Field label="FX markup %"><Input type="number" step="0.01" value={String(value.fx_markup_percent)} onChange={setNum("fx_markup_percent")} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min amount"><Input type="number" step="0.01" value={String(value.min_amount)} onChange={setNum("min_amount")} /></Field>
        <Field label="Max amount"><Input type="number" step="0.01" value={String(value.max_amount)} onChange={setNum("max_amount")} /></Field>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={value.enabled} onCheckedChange={(v) => onChange({ ...value, enabled: v })} />
        <span className="text-sm">Enabled (live)</span>
      </div>
    </div>
  );
}
