import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, RefreshCw, Route, TrendingUp, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  useEfinPricing,
  useAddEfinPricing,
  useRetireEfinPricing,
  usePaymentPartners,
  useUpdatePartner,
  usePartnerFxRates,
  useAddPartnerFxRate,
  useRefreshPartnerLiveRates,
  isPartnerActive,
  type EfinPricing,
} from "@/hooks/usePartnerNetwork";
import { useFxRates, useInsertFxRate } from "@/hooks/useFxRates";
import {
  useCorridorRailPolicies,
  useSaveCorridorRailPolicy,
  type RailDirection,
} from "@/lib/corridorRails";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PRIMARY = ["nomba", "fincra"] as const;

const CURRENCIES = [
  "CAD", "USD", "EUR", "GBP", "NGN", "GHS", "KES", "UGX", "TZS", "RWF", "ZMW", "ZAR", "XOF", "XAF",
];

const PAYMENT_METHODS = ["wallet", "card", "bank", "mobile_money", "interac", "any"];

const CORRIDOR_PRESETS = [
  { currency: "CAD", country: "CA" },
  { currency: "USD", country: "US" },
  { currency: "NGN", country: "NG" },
  { currency: "GHS", country: "GH" },
  { currency: "KES", country: "KE" },
  { currency: "UGX", country: "UG" },
  { currency: "TZS", country: "TZ" },
  { currency: "ZMW", country: "ZM" },
  { currency: "ZAR", country: "ZA" },
  { currency: "XOF", country: "SN" },
  { currency: "XAF", country: "CM" },
  { currency: "RWF", country: "RW" },
];

function FeesPanel() {
  const { data: rows = [], isLoading } = useEfinPricing(false);
  const add = useAddEfinPricing();
  const retire = useRetireEfinPricing();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<EfinPricing>>({
    customer_type: "consumer",
    direction: "payout",
    source_currency: "CAD",
    dest_currency: "NGN",
    dest_country: "NG",
    payment_method: "wallet",
    fixed_fee: 0,
    percentage_fee: 1.5,
    fx_margin_bps: 100,
  });

  const save = async () => {
    if (!draft.source_currency || !draft.dest_currency) {
      toast.error("Source and destination currencies are required");
      return;
    }
    await add.mutateAsync({
      ...draft,
      source_currency: draft.source_currency!.toUpperCase(),
      dest_currency: draft.dest_currency!.toUpperCase(),
      dest_country: draft.dest_country ? draft.dest_country.toUpperCase() : null,
      payment_method: draft.payment_method === "any" ? null : draft.payment_method || null,
      fixed_fee: Number(draft.fixed_fee || 0),
      percentage_fee: Number(draft.percentage_fee || 0),
      fx_margin_bps: Number(draft.fx_margin_bps || 0),
      effective_from: new Date().toISOString(),
      effective_to: null,
    });
    setOpen(false);
  };

  return (
    <Card className="rounded-2xl border-[hsl(var(--brand-900)/0.08)] shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 bg-gradient-to-r from-amber-50/80 to-transparent">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-display text-[hsl(var(--brand-900))]">
            <Receipt className="h-5 w-5 text-amber-600" /> Customer fees
          </CardTitle>
          <CardDescription>
            What we charge on Send / Top-up. Writes to efinmoney_pricing (same as Classic).
          </CardDescription>
        </div>
        <Button
          size="sm"
          className="rounded-full bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] hover:bg-amber-400 shadow-cta-amber"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> Add fee
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No active fee rules yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Direction</TableHead>
                  <TableHead>Corridor</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Fixed</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">FX margin</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="capitalize text-xs">{r.direction}</TableCell>
                    <TableCell className="font-medium">
                      {r.source_currency}→{r.dest_currency}
                      {r.dest_country ? ` · ${r.dest_country}` : ""}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{r.payment_method || "any"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.fixed_fee.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.percentage_fee}%</TableCell>
                    <TableCell className="text-right tabular-nums">{r.fx_margin_bps} bps</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={retire.isPending}
                        onClick={() => retire.mutate(r.id)}
                      >
                        Retire
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add customer fee</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Direction</Label>
                <Select
                  value={draft.direction}
                  onValueChange={(v) => setDraft((d) => ({ ...d, direction: v as EfinPricing["direction"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payin">Top-up (payin)</SelectItem>
                    <SelectItem value="payout">Send (payout)</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment method</Label>
                <Select
                  value={draft.payment_method || "wallet"}
                  onValueChange={(v) => setDraft((d) => ({ ...d, payment_method: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>From</Label>
                <Select
                  value={draft.source_currency}
                  onValueChange={(v) => setDraft((d) => ({ ...d, source_currency: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>To</Label>
                <Select
                  value={draft.dest_currency || ""}
                  onValueChange={(v) => setDraft((d) => ({ ...d, dest_currency: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Country</Label>
                <Input
                  value={draft.dest_country || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, dest_country: e.target.value.toUpperCase() }))}
                  placeholder="NG"
                  maxLength={2}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Fixed fee</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(draft.fixed_fee ?? 0)}
                  onChange={(e) => setDraft((d) => ({ ...d, fixed_fee: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Fee %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(draft.percentage_fee ?? 0)}
                  onChange={(e) => setDraft((d) => ({ ...d, percentage_fee: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>FX margin (bps)</Label>
                <Input
                  type="number"
                  step="1"
                  value={String(draft.fx_margin_bps ?? 0)}
                  onChange={(e) => setDraft((d) => ({ ...d, fx_margin_bps: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={add.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function FxPanel() {
  const { data: partners = [] } = usePaymentPartners();
  const primaryPartners = partners.filter((p) => PRIMARY.includes(p.code?.toLowerCase() as typeof PRIMARY[number]));
  const nomba = primaryPartners.find((p) => p.code?.toLowerCase() === "nomba");
  const fincra = primaryPartners.find((p) => p.code?.toLowerCase() === "fincra");

  const { data: midRates = [], isLoading: midLoading } = useFxRates();
  const insertMid = useInsertFxRate();
  const refreshLive = useRefreshPartnerLiveRates();
  const addPartnerRate = useAddPartnerFxRate();

  const { data: nombaRates } = usePartnerFxRates(nomba?.id);
  const { data: fincraRates } = usePartnerFxRates(fincra?.id);

  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("NGN");
  const [rate, setRate] = useState("1400");
  const [partnerId, setPartnerId] = useState("");
  const [partnerRate, setPartnerRate] = useState("");

  const partnerRates = useMemo(() => {
    const a = (nombaRates || []).slice(0, 8);
    const b = (fincraRates || []).slice(0, 8);
    return [...a, ...b].sort((x, y) => +new Date(y.rate_timestamp) - +new Date(x.rate_timestamp)).slice(0, 16);
  }, [nombaRates, fincraRates]);

  const nameOf = (id: string) => partners.find((p) => p.id === id)?.name || id.slice(0, 6);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-[hsl(var(--brand-900)/0.08)] shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-amber-50/80 to-transparent">
          <CardTitle className="flex items-center gap-2 text-lg font-display text-[hsl(var(--brand-900))]">
            <TrendingUp className="h-5 w-5 text-amber-600" /> Mid-market FX
          </CardTitle>
          <CardDescription>
            Override customer mid rates in fx_rates (latest wins). Example: set USD→NGN to 1400 today.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>From</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rate</Label>
              <Input className="w-[120px]" type="number" step="any" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <Button
              className="rounded-full bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] hover:bg-amber-400 shadow-cta-amber"
              disabled={insertMid.isPending}
              onClick={() =>
                insertMid.mutate({ from_currency: from, to_currency: to, rate: Number(rate) })
              }
            >
              Save mid rate
            </Button>
          </div>

          {midLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="overflow-x-auto max-h-56">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pair</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>From</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {midRates.slice(0, 24).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.from_currency}/{r.to_currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.effective_rate ?? r.rate}</TableCell>
                      <TableCell className="text-xs">{r.source || "—"}</TableCell>
                      <TableCell className="text-xs">{format(new Date(r.valid_from), "dd MMM HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-[hsl(var(--brand-900)/0.08)] shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-3 bg-gradient-to-r from-[hsl(var(--brand-900)/0.04)] to-transparent">
          <div>
            <CardTitle className="text-lg font-display text-[hsl(var(--brand-900))]">Nomba & Fincra partner rates</CardTitle>
            <CardDescription>Manual override or pull live API quotes into partner_fx_rates.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={refreshLive.isPending} onClick={() => refreshLive.mutate("nomba")}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", refreshLive.isPending && "animate-spin")} />
              Nomba
            </Button>
            <Button size="sm" variant="outline" disabled={refreshLive.isPending} onClick={() => refreshLive.mutate("fincra")}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", refreshLive.isPending && "animate-spin")} />
              Fincra
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>Partner</Label>
              <Select
                value={partnerId || primaryPartners[0]?.id || ""}
                onValueChange={setPartnerId}
              >
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Partner" /></SelectTrigger>
                <SelectContent>
                  {primaryPartners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Partner rate</Label>
              <Input className="w-[120px]" type="number" step="any" value={partnerRate} onChange={(e) => setPartnerRate(e.target.value)} />
            </div>
            <Button
              disabled={addPartnerRate.isPending}
              onClick={() => {
                const pid = partnerId || primaryPartners[0]?.id;
                if (!pid) {
                  toast.error("No Nomba/Fincra partner row found");
                  return;
                }
                addPartnerRate.mutate({
                  partner_id: pid,
                  base_currency: from,
                  quote_currency: to,
                  partner_rate: Number(partnerRate),
                  source: "manual",
                  rate_timestamp: new Date().toISOString(),
                });
              }}
            >
              Record manual
            </Button>
          </div>

          <div className="overflow-x-auto max-h-56">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partnerRates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No Nomba/Fincra rates yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  partnerRates.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{nameOf(r.partner_id)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.base_currency}/{r.quote_currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.partner_rate}</TableCell>
                      <TableCell>
                        <Badge variant={r.source === "api" ? "default" : "outline"}>
                          {r.source === "api" ? "Live" : r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(r.rate_timestamp), "dd MMM HH:mm")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RailsPanel() {
  const { data: partners = [] } = usePaymentPartners();
  const updatePartner = useUpdatePartner();
  const { data: policies = [], isLoading } = useCorridorRailPolicies();
  const save = useSaveCorridorRailPolicy();

  const primary = partners.filter((p) => PRIMARY.includes(p.code?.toLowerCase() as typeof PRIMARY[number]));

  const [direction, setDirection] = useState<RailDirection>("payout");
  const [corridorKey, setCorridorKey] = useState("NGN::NG");
  const [preferred, setPreferred] = useState("nomba");
  const [failover, setFailover] = useState("fincra");

  const relevant = useMemo(
    () =>
      policies.filter((p) => {
        const pref = (p.preferred_partner || "").toLowerCase();
        const fail = (p.failover_partners || []).map((x) => x.toLowerCase());
        return PRIMARY.includes(pref as typeof PRIMARY[number])
          || fail.some((f) => PRIMARY.includes(f as typeof PRIMARY[number]));
      }),
    [policies],
  );

  const savePolicy = async () => {
    const [currency, country = ""] = corridorKey.split("::");
    try {
      await save.mutateAsync({
        direction,
        currency_code: currency,
        country_code: country,
        preferred_partner: preferred,
        failover_partners: failover && failover !== preferred ? [failover] : [],
        enabled: true,
        notes: "Set from Simple Admin",
      });
      toast.success("Rail preference saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-[hsl(var(--brand-900)/0.08)] shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-amber-50/80 to-transparent">
          <CardTitle className="text-lg font-display text-[hsl(var(--brand-900))]">Provider on / off</CardTitle>
          <CardDescription>Pause Nomba or Fincra globally (syncs corridor rails like Classic).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {PRIMARY.map((code) => {
            const p = primary.find((x) => x.code?.toLowerCase() === code);
            const active = p ? isPartnerActive(p) : false;
            return (
              <div key={code} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="font-medium capitalize">{code}</p>
                  <p className="text-xs text-muted-foreground">{p ? (active ? "Live" : "Off") : "Not in partners table"}</p>
                </div>
                <Switch
                  checked={active}
                  disabled={!p || updatePartner.isPending}
                  onCheckedChange={(on) => {
                    if (!p) return;
                    updatePartner.mutate({ id: p.id, patch: { status: on ? "active" : "inactive" } });
                  }}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-[hsl(var(--brand-900)/0.08)] shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-[hsl(var(--brand-900)/0.04)] to-transparent">
          <CardTitle className="flex items-center gap-2 text-lg font-display text-[hsl(var(--brand-900))]">
            <Route className="h-5 w-5 text-amber-600" /> Who pays this corridor
          </CardTitle>
          <CardDescription>
            Preferred = Nomba or Fincra. Writes corridor_rail_policies (same as Classic).
            Some corridors may still force Nomba in edge code until that override is removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as RailDirection)}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="collect">Collect</SelectItem>
                  <SelectItem value="payout">Payout</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Corridor</Label>
              <Select value={corridorKey} onValueChange={setCorridorKey}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CORRIDOR_PRESETS.map((c) => (
                    <SelectItem key={`${c.currency}::${c.country}`} value={`${c.currency}::${c.country}`}>
                      {c.currency} · {c.country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preferred</Label>
              <Select value={preferred} onValueChange={setPreferred}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nomba">Nomba</SelectItem>
                  <SelectItem value="fincra">Fincra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Failover</Label>
              <Select value={failover || "none"} onValueChange={(v) => setFailover(v === "none" ? "" : v)}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fincra">Fincra</SelectItem>
                  <SelectItem value="nomba">Nomba</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={save.isPending} onClick={() => void savePolicy()} className="rounded-full bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] hover:bg-amber-400 shadow-cta-amber">
              Save preference
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="overflow-x-auto max-h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Direction</TableHead>
                    <TableHead>Corridor</TableHead>
                    <TableHead>Preferred</TableHead>
                    <TableHead>Failover</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relevant.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No Nomba/Fincra corridor policies yet — save one above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    relevant.map((p) => (
                      <TableRow key={p.id} className={!p.enabled ? "opacity-50" : undefined}>
                        <TableCell className="capitalize text-xs">{p.direction}</TableCell>
                        <TableCell className="font-medium">
                          {p.currency_code}{p.country_code ? ` · ${p.country_code}` : ""}
                        </TableCell>
                        <TableCell className="capitalize">{p.preferred_partner}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(p.failover_partners || []).join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.enabled ? "default" : "outline"}>
                            {p.enabled ? "On" : "Off"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SimpleRatesPage() {
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-900))] via-[hsl(var(--brand-800))] to-[hsl(256_60%_28%)] px-6 py-8 sm:px-8 text-white shadow-card-purple">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-10 h-48 w-48 rounded-full bg-[hsl(var(--accent-amber)/0.28)] blur-2xl"
        />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
          Pricing & rails
        </p>
        <h1 className="relative mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Partners & Rates
        </h1>
        <p className="relative mt-2 max-w-xl text-sm text-white/70">
          Set what we charge, override FX, and choose Nomba or Fincra — same live database as Classic.
        </p>
      </div>

      <Tabs defaultValue="fees" className="space-y-5">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-full bg-[hsl(var(--brand-900)/0.06)] p-1">
          <TabsTrigger
            value="fees"
            className="rounded-full data-[state=active]:bg-[hsl(var(--accent-amber))] data-[state=active]:text-[hsl(var(--brand-900))] data-[state=active]:shadow-cta-amber"
          >
            Fees
          </TabsTrigger>
          <TabsTrigger
            value="fx"
            className="rounded-full data-[state=active]:bg-[hsl(var(--accent-amber))] data-[state=active]:text-[hsl(var(--brand-900))] data-[state=active]:shadow-cta-amber"
          >
            FX rates
          </TabsTrigger>
          <TabsTrigger
            value="rails"
            className="rounded-full data-[state=active]:bg-[hsl(var(--accent-amber))] data-[state=active]:text-[hsl(var(--brand-900))] data-[state=active]:shadow-cta-amber"
          >
            Who pays
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fees"><FeesPanel /></TabsContent>
        <TabsContent value="fx"><FxPanel /></TabsContent>
        <TabsContent value="rails"><RailsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
