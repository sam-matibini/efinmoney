import { useMemo, useState } from "react";
import { usePaymentPartners, isPartnerActive, usePartnerCorridors } from "@/hooks/usePartnerNetwork";
import {
  usePartnerLimits,
  usePartnerLimitUsage,
  useSavePartnerLimit,
  useDeletePartnerLimit,
  type PartnerLimit,
} from "@/hooks/usePartnerOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, Plus, Trash2, Pencil } from "lucide-react";

const money = (v: number | null) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

const ANY_CORRIDOR = "__any__";

interface FormState {
  id?: string;
  partner_id: string;
  corridor_id: string;
  currency_code: string;
  min_amount: string;
  max_amount: string;
  daily_limit: string;
  monthly_limit: string;
}

const emptyForm: FormState = {
  partner_id: "",
  corridor_id: ANY_CORRIDOR,
  currency_code: "CAD",
  min_amount: "",
  max_amount: "",
  daily_limit: "",
  monthly_limit: "",
};

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export const PartnerLimitsPanel = () => {
  const { data: partners } = usePaymentPartners();
  const { data: limits, isLoading } = usePartnerLimits();
  const { data: usage } = usePartnerLimitUsage();
  const save = useSavePartnerLimit();
  const remove = useDeletePartnerLimit();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const { data: corridors } = usePartnerCorridors(form.partner_id || undefined);

  const partnerName = (id: string) => partners?.find((p) => p.id === id)?.name || "—";

  const rows = useMemo(
    () =>
      (limits ?? []).map((l) => {
        const u = usage?.[`${l.partner_id}|${l.currency_code}`] ?? { daily: 0, monthly: 0 };
        return {
          ...l,
          dailyUsed: u.daily,
          monthlyUsed: u.monthly,
          dailyPct: l.daily_limit ? Math.min(100, (u.daily / l.daily_limit) * 100) : null,
          monthlyPct: l.monthly_limit ? Math.min(100, (u.monthly / l.monthly_limit) * 100) : null,
        };
      }),
    [limits, usage],
  );

  const edit = (l: PartnerLimit) => {
    setForm({
      id: l.id,
      partner_id: l.partner_id,
      corridor_id: l.corridor_id ?? ANY_CORRIDOR,
      currency_code: l.currency_code,
      min_amount: l.min_amount?.toString() ?? "",
      max_amount: l.max_amount?.toString() ?? "",
      daily_limit: l.daily_limit?.toString() ?? "",
      monthly_limit: l.monthly_limit?.toString() ?? "",
    });
    setOpen(true);
  };

  const submit = () =>
    save.mutate(
      {
        id: form.id,
        partner_id: form.partner_id,
        corridor_id: form.corridor_id === ANY_CORRIDOR ? null : form.corridor_id,
        currency_code: form.currency_code.toUpperCase(),
        min_amount: num(form.min_amount),
        max_amount: num(form.max_amount),
        daily_limit: num(form.daily_limit),
        monthly_limit: num(form.monthly_limit),
      } as Partial<PartnerLimit>,
      {
        onSuccess: () => {
          setOpen(false);
          setForm(emptyForm);
        },
      },
    );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" /> Partner limits
          </CardTitle>
          <CardDescription>
            Per-transaction floors/ceilings and daily/monthly caps the router enforces before selecting a partner.
            Usage is measured from recorded transaction economics.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm(emptyForm);
            setOpen(true);
          }}
          disabled={!partners?.length}
        >
          <Plus className="h-4 w-4 mr-1" /> Add limit
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !rows.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No partner limits configured. Without limits the router only respects partner-level caps.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="w-40">Daily</TableHead>
                  <TableHead className="w-40">Monthly</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{partnerName(l.partner_id)}</TableCell>
                    <TableCell>{l.currency_code}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{l.corridor_id ? "Corridor" : "All corridors"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(l.min_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(l.max_amount)}</TableCell>
                    <TableCell>
                      {l.daily_limit ? (
                        <div className="space-y-1">
                          <Progress value={l.dailyPct ?? 0} className="h-2" />
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {money(l.dailyUsed)} / {money(l.daily_limit)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No cap</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.monthly_limit ? (
                        <div className="space-y-1">
                          <Progress value={l.monthlyPct ?? 0} className="h-2" />
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {money(l.monthlyUsed)} / {money(l.monthly_limit)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No cap</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => edit(l)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(l.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit limit" : "Add partner limit"}</DialogTitle>
            <DialogDescription>
              Leave a field blank for "no limit". Corridor-specific limits take precedence over all-corridor limits.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Partner</Label>
              <Select
                value={form.partner_id}
                onValueChange={(v) => setForm({ ...form, partner_id: v, corridor_id: ANY_CORRIDOR })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select partner" />
                </SelectTrigger>
                <SelectContent>
                  {partners?.filter(isPartnerActive).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Corridor</Label>
              <Select value={form.corridor_id} onValueChange={(v) => setForm({ ...form, corridor_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_CORRIDOR}>All corridors</SelectItem>
                  {corridors?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.source_currency} → {c.dest_currency} · {c.payment_method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Input
                value={form.currency_code}
                maxLength={3}
                onChange={(e) => setForm({ ...form, currency_code: e.target.value.toUpperCase() })}
              />
            </div>
            <div />
            <div>
              <Label>Min per transaction</Label>
              <Input
                type="number"
                value={form.min_amount}
                onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Max per transaction</Label>
              <Input
                type="number"
                value={form.max_amount}
                onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Daily cap</Label>
              <Input
                type="number"
                value={form.daily_limit}
                onChange={(e) => setForm({ ...form, daily_limit: e.target.value })}
              />
            </div>
            <div>
              <Label>Monthly cap</Label>
              <Input
                type="number"
                value={form.monthly_limit}
                onChange={(e) => setForm({ ...form, monthly_limit: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!form.partner_id || !form.currency_code || save.isPending} onClick={submit}>
              {save.isPending ? "Saving…" : "Save limit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PartnerLimitsPanel;
