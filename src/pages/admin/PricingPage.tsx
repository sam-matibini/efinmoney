import { useState } from "react";
import { Tags, Plus, Trash2, Loader2, Save, X } from "lucide-react";
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

const EMPTY: NewPricingRule = {
  name: "", source_currency: "CAD", dest_country: "NG", dest_currency: "NGN",
  payout_method: "bank", fee_percent: 1.5, fee_fixed: 2.99, fx_markup_percent: 1,
  min_amount: 5, max_amount: 10000, enabled: true,
};

export default function PricingPage() {
  const { data: rules = [], isLoading } = usePricingRules();
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

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Add corridor</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New pricing rule</DialogTitle></DialogHeader>
            <RuleForm value={draft} onChange={setDraft} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={submitNew} disabled={create.isPending} className="gap-2">
                {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
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
        </div>
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
function RuleForm({ value, onChange }: { value: NewPricingRule; onChange: (v: NewPricingRule) => void }) {
  const set = (k: keyof NewPricingRule) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const setNum = (k: keyof NewPricingRule) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value === "" ? 0 : Number(e.target.value) });

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
  );

  return (
    <div className="space-y-4">
      <Field label="Label (optional)">
        <Input value={value.name ?? ""} onChange={set("name")} placeholder="e.g. Canada → Nigeria (bank)" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Source currency"><Input value={value.source_currency} onChange={set("source_currency")} placeholder="CAD" /></Field>
        <Field label="Dest. country"><Input value={value.dest_country} onChange={set("dest_country")} placeholder="NG" maxLength={2} /></Field>
        <Field label="Dest. currency"><Input value={value.dest_currency} onChange={set("dest_currency")} placeholder="NGN" /></Field>
      </div>
      <Field label="Payout method">
        <Select value={value.payout_method} onValueChange={(v) => onChange({ ...value, payout_method: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PAYOUT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
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
