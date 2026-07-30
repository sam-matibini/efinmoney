import { useState } from "react";
import {
  usePaymentPartners,
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
import { Plus, Trash2, Droplets, RefreshCw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useRefreshLiquidity } from "@/hooks/useCostAssurance";

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
          <Button
            size="sm"
            onClick={() => {
              setDraft({ partner_id: partners?.[0]?.id, currency_code: "", available_balance: 0, required_reserve: 0, daily_utilized: 0 });
              setOpen(true);
            }}
            disabled={!partners?.length}
          >
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
                  <TableHead>As of</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidity.map((l) => {
                  const capacity = l.available_balance - l.required_reserve - l.daily_utilized;
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
                      <TableCell className="text-xs">{format(new Date(l.as_of), "dd MMM yy HH:mm")}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
            <DialogTitle>Update liquidity</DialogTitle>
            <DialogDescription>One balance per partner and currency.</DialogDescription>
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
              <Label>Currency</Label>
              <Input value={draft.currency_code || ""} onChange={(e) => set({ currency_code: e.target.value.toUpperCase() })} />
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
