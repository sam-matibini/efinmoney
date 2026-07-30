import { useState } from "react";
import {
  usePaymentPartners,
  usePartnerCorridors,
  useCreateCorridor,
  useUpdateCorridor,
  useDeleteCorridor,
  type PartnerCorridor,
} from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Route } from "lucide-react";

const empty: Partial<PartnerCorridor> = {
  direction: "payout",
  source_country: "CA",
  dest_country: "",
  source_currency: "CAD",
  dest_currency: "",
  payment_method: "bank",
  enabled: true,
};

export const PartnerCorridorsPanel = () => {
  const { data: partners } = usePaymentPartners();
  const [partnerId, setPartnerId] = useState<string>("");
  const { data: corridors, isLoading } = usePartnerCorridors(partnerId || undefined);
  const create = useCreateCorridor();
  const update = useUpdateCorridor();
  const remove = useDeleteCorridor();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<PartnerCorridor>>(empty);
  const set = (patch: Partial<PartnerCorridor>) => setDraft((d) => ({ ...d, ...patch }));

  const nameOf = (id: string) => partners?.find((p) => p.id === id)?.name || "—";

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" /> Corridors & Methods
            </CardTitle>
            <CardDescription>Which currency pairs, countries and methods each partner can serve</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={partnerId || "all"} onValueChange={(v) => setPartnerId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]">
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
            <Button
              size="sm"
              onClick={() => {
                setDraft({ ...empty, partner_id: partnerId || partners?.[0]?.id });
                setOpen(true);
              }}
              disabled={!partners?.length}
            >
              <Plus className="h-4 w-4 mr-1" /> Add corridor
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !corridors?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No corridors configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Corridor</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">ETA (min)</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {corridors.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{nameOf(c.partner_id)}</TableCell>
                    <TableCell className="capitalize">{c.direction}</TableCell>
                    <TableCell>
                      {(c.source_country || "—")} → {c.dest_country}
                    </TableCell>
                    <TableCell>
                      {c.source_currency}/{c.dest_currency}
                    </TableCell>
                    <TableCell className="capitalize">{c.payment_method.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.est_minutes ?? "—"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={c.enabled}
                        onCheckedChange={(enabled) => update.mutate({ id: c.id, patch: { enabled } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(c.id)}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add corridor</DialogTitle>
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
              <Select value={draft.direction} onValueChange={(v) => set({ direction: v as PartnerCorridor["direction"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payin">Pay-in</SelectItem>
                  <SelectItem value="payout">Pay-out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment method</Label>
              <Input
                value={draft.payment_method || ""}
                onChange={(e) => set({ payment_method: e.target.value.toLowerCase() })}
                placeholder="bank / mobile_money / card"
              />
            </div>
            <div>
              <Label>Source country</Label>
              <Input
                value={draft.source_country || ""}
                onChange={(e) => set({ source_country: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Destination country</Label>
              <Input
                value={draft.dest_country || ""}
                onChange={(e) => set({ dest_country: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Source currency</Label>
              <Input
                value={draft.source_currency || ""}
                onChange={(e) => set({ source_currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Destination currency</Label>
              <Input
                value={draft.dest_currency || ""}
                onChange={(e) => set({ dest_currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Estimated minutes</Label>
              <Input
                type="number"
                value={draft.est_minutes ?? ""}
                onChange={(e) => set({ est_minutes: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                create.mutate(draft, {
                  onSuccess: () => setOpen(false),
                })
              }
              disabled={!draft.partner_id || !draft.dest_country || !draft.dest_currency}
            >
              Add corridor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PartnerCorridorsPanel;
