import { useMemo, useState } from "react";
import {
  usePaymentPartners,
  usePartnerFxRates,
  useAddPartnerFxRate,
  type PartnerFxRate,
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
import { Plus, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { useTableQuery, type Col } from "./tableToolkit";

const empty: Partial<PartnerFxRate> = {
  base_currency: "CAD",
  quote_currency: "",
  source: "manual",
};

export const PartnerFxRatesPanel = () => {
  const { data: partners } = usePaymentPartners();
  const [partnerId, setPartnerId] = useState("");
  const { data: rates, isLoading } = usePartnerFxRates(partnerId || undefined);
  const add = useAddPartnerFxRate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<PartnerFxRate>>(empty);
  const set = (patch: Partial<PartnerFxRate>) => setDraft((d) => ({ ...d, ...patch }));

  const nameOf = (id: string) => partners?.find((p) => p.id === id)?.name || "—";

  const cols = useMemo<Col<PartnerFxRate>[]>(
    () => [
      { key: "partner", label: "Partner", value: (r) => nameOf(r.partner_id), filter: true },
      { key: "pair", label: "Pair", value: (r) => `${r.base_currency}/${r.quote_currency}`, filter: true },
      { key: "partner_rate", label: "Partner rate", value: (r) => r.partner_rate, type: "number", align: "right" },
      { key: "mid", label: "Mid-market", value: (r) => r.mid_market_rate ?? 0, type: "number", align: "right" },
      { key: "spread", label: "Spread", value: (r) => r.fx_spread_bps ?? 0, type: "number", align: "right" },
      { key: "recorded", label: "Recorded", value: (r) => r.rate_timestamp, type: "date" },
      { key: "source", label: "Source", value: (r) => r.source, filter: true },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partners],
  );

  const { view, Controls, HeadRow } = useTableQuery(rates, cols, {
    defaultSort: "recorded",
    defaultDir: "desc",
    exportName: "partner-fx-rates",
    searchPlaceholder: "Search partner, pair, source…",
  });



  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Partner FX Rates
            </CardTitle>
            <CardDescription>
              Partner quotes stored against the mid-market reference, so FX cost is separated from transaction fees.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={partnerId || "all"} onValueChange={(v) => setPartnerId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[180px]">
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
              <Plus className="h-4 w-4 mr-1" /> Record rate
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !rates?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No partner rates recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Partner rate</TableHead>
                  <TableHead className="text-right">Mid-market</TableHead>
                  <TableHead className="text-right">Spread</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r) => {
                  const expired = r.expires_at ? new Date(r.expires_at) < new Date() : false;
                  return (
                    <TableRow key={r.id} className={expired ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{nameOf(r.partner_id)}</TableCell>
                      <TableCell>
                        {r.base_currency}/{r.quote_currency}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.partner_rate.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.mid_market_rate ? r.mid_market_rate.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.fx_spread_bps === null || r.fx_spread_bps === undefined ? (
                          "—"
                        ) : (
                          <Badge variant={r.fx_spread_bps > 100 ? "destructive" : "secondary"}>
                            {r.fx_spread_bps.toFixed(0)} bps
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(r.rate_timestamp), "dd MMM yy HH:mm")}</TableCell>
                      <TableCell className="text-xs capitalize">{r.source.replace(/_/g, " ")}</TableCell>
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
            <DialogTitle>Record partner rate</DialogTitle>
            <DialogDescription>The spread against mid-market is calculated automatically.</DialogDescription>
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
              <Label>Base currency</Label>
              <Input value={draft.base_currency || ""} onChange={(e) => set({ base_currency: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Quote currency</Label>
              <Input value={draft.quote_currency || ""} onChange={(e) => set({ quote_currency: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Partner rate</Label>
              <Input
                type="number"
                step="0.0001"
                value={draft.partner_rate ?? ""}
                onChange={(e) => set({ partner_rate: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Mid-market rate</Label>
              <Input
                type="number"
                step="0.0001"
                value={draft.mid_market_rate ?? ""}
                onChange={(e) => set({ mid_market_rate: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Source</Label>
              <Select value={draft.source} onValueChange={(v) => set({ source: v as PartnerFxRate["source"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="api">Partner API</SelectItem>
                  <SelectItem value="partner_portal">Partner portal</SelectItem>
                  <SelectItem value="file">File upload</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => add.mutate(draft, { onSuccess: () => setOpen(false) })}
              disabled={!draft.partner_id || !draft.quote_currency || !draft.partner_rate}
            >
              Record rate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PartnerFxRatesPanel;
