import { useState } from "react";
import {
  useMarginFloors,
  useSaveMarginFloor,
  useDeleteMarginFloor,
  type MarginFloor,
  type MarginFloorAction,
} from "@/hooks/usePartnerOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { ShieldCheck, Plus, Trash2, Pencil } from "lucide-react";

interface FormState {
  id?: string;
  scope: "global" | "corridor";
  source_currency: string;
  dest_currency: string;
  dest_country: string;
  payment_method: string;
  min_margin_percent: string;
  action: MarginFloorAction;
  is_active: boolean;
  notes: string;
}

const emptyForm: FormState = {
  scope: "corridor",
  source_currency: "",
  dest_currency: "",
  dest_country: "",
  payment_method: "",
  min_margin_percent: "1.5",
  action: "warn",
  is_active: true,
  notes: "",
};

const nullable = (v: string) => (v.trim() === "" ? null : v.trim().toUpperCase());

const ACTION_COPY: Record<MarginFloorAction, string> = {
  warn: "Flag the route, keep routing unchanged",
  uplift: "Raise the customer fee to clear the floor",
  block: "Drop the partner and fail over to the next candidate",
};

const actionVariant = (a: MarginFloorAction) =>
  a === "block" ? "destructive" : a === "uplift" ? "default" : "secondary";

export const MarginGuardrailsPanel = () => {
  const { data: floors, isLoading } = useMarginFloors();
  const save = useSaveMarginFloor();
  const remove = useDeleteMarginFloor();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const edit = (f: MarginFloor) => {
    setForm({
      id: f.id,
      scope: f.scope,
      source_currency: f.source_currency ?? "",
      dest_currency: f.dest_currency ?? "",
      dest_country: f.dest_country ?? "",
      payment_method: f.payment_method ?? "",
      min_margin_percent: String(f.min_margin_percent ?? ""),
      action: f.action,
      is_active: f.is_active,
      notes: f.notes ?? "",
    });
    setOpen(true);
  };

  const submit = () => {
    const isGlobal = form.scope === "global";
    save.mutate(
      {
        id: form.id,
        scope: form.scope,
        source_currency: isGlobal ? null : nullable(form.source_currency),
        dest_currency: isGlobal ? null : nullable(form.dest_currency),
        dest_country: isGlobal ? null : nullable(form.dest_country),
        payment_method: isGlobal ? null : form.payment_method.trim() || null,
        min_margin_percent: Number(form.min_margin_percent) || 0,
        action: form.action,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      } as Partial<MarginFloor>,
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Margin guardrails
          </CardTitle>
          <CardDescription>
            Minimum margin (profit over transaction amount) enforced at quote and execution time. A corridor
            floor overrides the global default.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add floor
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !floors?.length ? (
          <p className="text-sm text-muted-foreground">No margin floors configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Corridor</TableHead>
                  <TableHead className="text-right">Floor %</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {floors.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="capitalize">{f.scope}</TableCell>
                    <TableCell className="text-sm">
                      {f.scope === "global"
                        ? "All corridors"
                        : `${f.source_currency ?? "*"} → ${f.dest_currency ?? "*"}${
                            f.dest_country ? ` · ${f.dest_country}` : ""
                          }${f.payment_method ? ` · ${f.payment_method}` : ""}`}
                    </TableCell>
                    <TableCell className="text-right font-mono">{f.min_margin_percent}%</TableCell>
                    <TableCell>
                      <Badge variant={actionVariant(f.action)}>{f.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.is_active ? "default" : "secondary"}>
                        {f.is_active ? "Active" : "Paused"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => edit(f)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {f.scope !== "global" && (
                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(f.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit margin floor" : "New margin floor"}</DialogTitle>
            <DialogDescription>{ACTION_COPY[form.action]}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Scope</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => setForm({ ...form, scope: v as FormState["scope"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global default</SelectItem>
                  <SelectItem value="corridor">Specific corridor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.scope === "corridor" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Source currency</Label>
                  <Input
                    value={form.source_currency}
                    onChange={(e) => setForm({ ...form, source_currency: e.target.value })}
                    placeholder="CAD"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Dest currency</Label>
                  <Input
                    value={form.dest_currency}
                    onChange={(e) => setForm({ ...form, dest_currency: e.target.value })}
                    placeholder="NGN"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Dest country (optional)</Label>
                  <Input
                    value={form.dest_country}
                    onChange={(e) => setForm({ ...form, dest_country: e.target.value })}
                    placeholder="NG"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Payment method (optional)</Label>
                  <Input
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    placeholder="mobile_money"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Minimum margin %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.min_margin_percent}
                  onChange={(e) => setForm({ ...form, min_margin_percent: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Breach action</Label>
                <Select
                  value={form.action}
                  onValueChange={(v) => setForm({ ...form, action: v as MarginFloorAction })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">Warn</SelectItem>
                    <SelectItem value="uplift">Uplift fee</SelectItem>
                    <SelectItem value="block">Block route</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              Save floor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MarginGuardrailsPanel;
