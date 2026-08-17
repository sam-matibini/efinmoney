import { useState } from "react";
import {
  usePaymentPartners,
  isPartnerActive,
  usePartnerLiquidity,
  useUpsertLiquidity,
  useDeleteLiquidity,
  type PartnerLiquidity,
} from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Trash2, Droplets, RefreshCw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useRefreshLiquidity } from "@/hooks/useCostAssurance";

const SOURCE_LABELS: Record<string, string> = {
  api: "API",
  manual: "Manual",
  file: "File",
  partner_portal: "Portal",
};

const SourceBadge = ({ source }: { source: string }) => {
  const variant =
    source === "api"
      ? "default"
      : source === "file"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant} className="text-[10px]">
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  );
};

export const PartnerLiquidityPanel = () => {
  const { data: partners } = usePaymentPartners();
  const { data: liquidity, isLoading } = usePartnerLiquidity();
  const upsert = useUpsertLiquidity();
  const remove = useDeleteLiquidity();
  const refresh = useRefreshLiquidity();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<PartnerLiquidity>>({
    currency_code: "",
    available_balance: 0,
    required_reserve: 0,
    daily_utilized: 0,
  });
  const set = (patch: Partial<PartnerLiquidity>) => setDraft((d) => ({ ...d, ...patch }));

  const nameOf = (id: string) => partners?.find((p) => p.id === id)?.name || "—";

  const openNew = () => {
    setDraft({ partner_id: partners?.[0]?.id, currency_code: "", available_balance: 0, required_reserve: 0, daily_utilized: 0 });
    setOpen(true);
  };

  const openEdit = (l: PartnerLiquidity) => {
    setDraft({ ...l });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" /> Partner Liquidity
          </CardTitle>
          <CardDescription>
            Available payout capacity per partner and currency. A partner becomes ineligible when capacity is short.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh from partners
          </Button>
          <Button size="sm" onClick={openNew} disabled={!partners?.length}>
            <Plus className="h-4 w-4 mr-1" /> Update balance
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !liquidity?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No liquidity balances recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Reserve</TableHead>
                  <TableHead className="text-right">Used today</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>As of</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidity.map((l) => {
                  const capacity = l.available_balance - l.required_reserve - l.daily_utilized;
                  const stale = Date.now() - new Date(l.as_of).getTime() > 12 * 3_600_000;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{nameOf(l.partner_id)}</TableCell>
                      <TableCell>{l.currency_code}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.available_balance.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.required_reserve.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.daily_utilized.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant={capacity > 0 ? "secondary" : "destructive"}>{capacity.toLocaleString()}</Badge>
                      </TableCell>
                      <TableCell>
                        <SourceBadge source={l.source} />
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={stale ? "text-amber-500" : ""}>
                          {format(new Date(l.as_of), "dd MMM yy HH:mm")}
                        </span>
                        {stale && (
                          <div className="flex items-center gap-1 text-amber-500">
                            <AlertTriangle className="h-3 w-3" /> stale — skipped by router
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(l)} aria-label="Edit balance">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove.mutate(l.id)} aria-label="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit liquidity balance" : "Add liquidity balance"}</DialogTitle>
            <DialogDescription>One balance row per partner and currency.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Partner</Label>
              {draft.id ? (
                <p className="mt-1 text-sm font-medium">{nameOf(draft.partner_id ?? "")}</p>
              ) : (
                <Select value={draft.partner_id} onValueChange={(v) => set({ partner_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>
                    {partners?.filter(isPartnerActive).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Currency</Label>
              {draft.id ? (
                <p className="mt-1 text-sm font-medium">{draft.currency_code}</p>
              ) : (
                <Input value={draft.currency_code || ""} onChange={(e) => set({ currency_code: e.target.value.toUpperCase() })} />
              )}
            </div>
            <div>
              <Label>Available balance</Label>
              <Input
                type="number"
                value={draft.available_balance ?? 0}
                onChange={(e) => set({ available_balance: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Required reserve</Label>
              <Input
                type="number"
                value={draft.required_reserve ?? 0}
                onChange={(e) => set({ required_reserve: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Utilized today</Label>
              <Input
                type="number"
                value={draft.daily_utilized ?? 0}
                onChange={(e) => set({ daily_utilized: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => upsert.mutate(draft, { onSuccess: () => setOpen(false) })}
              disabled={!draft.partner_id || !draft.currency_code}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PartnerLiquidityPanel;
