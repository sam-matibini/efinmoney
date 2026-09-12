import { useMemo, useState } from "react";
import {
  RAIL_OPTIONS,
  activeRailSetFromPartners,
  defaultCollectPartner,
  defaultPayoutPartner,
  useCorridorRailPolicies,
  useDeleteCorridorRailPolicy,
  useSaveCorridorRailPolicy,
  type CorridorRailPolicy,
  type RailDirection,
} from "@/lib/corridorRails";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type CorridorOption = {
  currency: string;
  currencyLabel: string;
  country: string; // "" = all
  countryLabel: string;
};

/** Only real corridors we run — pick from these, nothing else. */
const CORRIDORS: CorridorOption[] = [
  { currency: "CAD", currencyLabel: "Canadian dollars (CAD)", country: "CA", countryLabel: "Canada" },
  { currency: "CAD", currencyLabel: "Canadian dollars (CAD)", country: "", countryLabel: "Anywhere (CAD)" },
  { currency: "USD", currencyLabel: "US dollars (USD)", country: "US", countryLabel: "United States" },
  { currency: "USD", currencyLabel: "US dollars (USD)", country: "", countryLabel: "Anywhere (USD)" },
  { currency: "EUR", currencyLabel: "Euros (EUR)", country: "", countryLabel: "Anywhere (EUR)" },
  { currency: "GBP", currencyLabel: "British pounds (GBP)", country: "GB", countryLabel: "United Kingdom" },
  { currency: "NGN", currencyLabel: "Nigerian naira (NGN)", country: "NG", countryLabel: "Nigeria" },
  { currency: "GHS", currencyLabel: "Ghanaian cedi (GHS)", country: "GH", countryLabel: "Ghana" },
  { currency: "KES", currencyLabel: "Kenyan shilling (KES)", country: "KE", countryLabel: "Kenya" },
  { currency: "UGX", currencyLabel: "Ugandan shilling (UGX)", country: "UG", countryLabel: "Uganda" },
  { currency: "TZS", currencyLabel: "Tanzanian shilling (TZS)", country: "TZ", countryLabel: "Tanzania" },
  { currency: "RWF", currencyLabel: "Rwandan franc (RWF)", country: "RW", countryLabel: "Rwanda" },
  { currency: "ZMW", currencyLabel: "Zambian kwacha (ZMW)", country: "ZM", countryLabel: "Zambia" },
  { currency: "ZAR", currencyLabel: "South African rand (ZAR)", country: "ZA", countryLabel: "South Africa" },
  { currency: "XOF", currencyLabel: "West African CFA (XOF)", country: "SN", countryLabel: "Senegal" },
  { currency: "XOF", currencyLabel: "West African CFA (XOF)", country: "CI", countryLabel: "Côte d'Ivoire" },
  { currency: "XAF", currencyLabel: "Central African CFA (XAF)", country: "CM", countryLabel: "Cameroon" },
];

type PartnerMeta = {
  id: (typeof RAIL_OPTIONS)[number];
  name: string;
  blurb: string;
  collect: string[]; // currency codes, or ["*"]
  payout: string[];
};

const PARTNERS: PartnerMeta[] = [
  { id: "flovide", name: "Flovide", blurb: "Interac top-up in Canada; bank send to NG/KE/GH/UG/CA", collect: ["CAD"], payout: ["NGN", "KES", "GHS", "UGX", "CAD"] },
  { id: "fincra", name: "Fincra", blurb: "Africa collect + payout; CAD Interac Autodeposit collect (not M-Pesa)", collect: ["CAD", "USD", "EUR", "GBP", "NGN", "GHS", "KES", "UGX", "TZS", "ZMW", "ZAR", "XOF", "XAF", "MWK"], payout: ["NGN", "GHS", "KES", "UGX", "TZS", "ZMW", "ZAR", "XOF", "XAF"] },
  { id: "nomba", name: "Nomba", blurb: "NGN bank + Global Payout (KE/GH/UG/TZ/RW/XOF/XAF/CAD Interac/GBP/EUR/USD/ZAR…)", collect: ["NGN", "CAD"], payout: ["NGN", "GHS", "KES", "UGX", "TZS", "RWF", "XOF", "XAF", "ZAR", "CAD", "GBP", "EUR", "USD"] },
  { id: "flutterwave", name: "Flutterwave", blurb: "Africa MoMo payout + western card collect. CAD collect is card/bank — never Kenya M-Pesa.", collect: ["CAD", "USD", "NGN", "GHS", "KES", "UGX", "RWF", "TZS", "ZMW"], payout: ["NGN", "GHS", "KES", "UGX", "RWF", "TZS", "ZMW"] },
  { id: "lenhub_flutter", name: "Lenhub", blurb: "Card collect + FX bank/MoMo payouts", collect: ["CAD", "USD", "EUR", "GBP", "NGN", "GHS", "KES", "UGX", "RWF", "TZS"], payout: ["NGN", "GHS", "KES", "UGX", "TZS", "RWF", "ZMW"] },
  { id: "paytota", name: "Paytota", blurb: "Western invoices + East Africa MoMo", collect: ["CAD", "USD", "EUR", "GBP", "UGX", "KES", "RWF"], payout: ["UGX", "KES", "RWF"] },
  { id: "swychr", name: "Swychr", blurb: "Select Africa MoMo corridors", collect: ["XAF", "KES", "XOF", "UGX"], payout: ["XAF", "KES", "XOF", "UGX"] },
  { id: "ghana_pay", name: "Ghana Pay", blurb: "Ghana cedi top-up and payout", collect: ["GHS"], payout: ["GHS"] },
  { id: "elicate", name: "Elicate", blurb: "Zambia kwacha MoMo", collect: ["ZMW"], payout: ["ZMW"] },
  { id: "dodo", name: "Dodo", blurb: "Card checkout to top up western wallets", collect: ["CAD", "USD", "EUR", "GBP"], payout: [] },
  { id: "square", name: "Square", blurb: "Card checkout for western wallets", collect: ["USD", "EUR", "GBP"], payout: [] },
  { id: "paypal", name: "PayPal", blurb: "PayPal checkout for western wallets", collect: ["CAD", "USD", "EUR", "GBP"], payout: [] },
  { id: "wise", name: "Wise", blurb: "Bank deposit top-up with a payment reference", collect: ["CAD", "USD", "EUR", "GBP"], payout: [] },
  { id: "interac", name: "Interac (legacy)", blurb: "Older Interac collect path — prefer Flovide for CAD", collect: ["CAD"], payout: [] },
];

function partnersFor(direction: RailDirection, currency: string): PartnerMeta[] {
  const list = PARTNERS.filter((p) => {
    const allowed = direction === "collect" ? p.collect : p.payout;
    return allowed.includes(currency) || allowed.includes("*");
  });
  const preferred =
    direction === "collect" ? defaultCollectPartner(currency) : defaultPayoutPartner(currency);
  if (!preferred) return list;
  return [...list].sort((a, b) => {
    if (a.id === preferred) return -1;
    if (b.id === preferred) return 1;
    return 0;
  });
}

function findPolicy(
  rows: CorridorRailPolicy[],
  direction: RailDirection,
  currency: string,
  country: string,
): CorridorRailPolicy | undefined {
  return (
    rows.find(
      (r) =>
        r.direction === direction
        && r.currency_code === currency
        && (r.country_code || "") === (country || ""),
    )
    || rows.find(
      (r) =>
        r.direction === direction
        && r.currency_code === currency
        && !r.country_code,
    )
  );
}

function partnerName(id: string) {
  return PARTNERS.find((p) => p.id === id)?.name || id;
}

function corridorKey(currency: string, country: string) {
  return `${currency}::${country || ""}`;
}

const emptyForm = {
  id: "" as string | undefined,
  direction: "payout" as RailDirection,
  corridorKey: "NGN::NG",
  preferred_partner: "",
  failover_partners: [] as string[],
  enabled: true,
  notes: "",
};

function parseCorridor(key: string): { currency: string; country: string } {
  const [currency, country = ""] = key.split("::");
  return { currency: currency || "NGN", country };
}

export default function CorridorRailsPanel() {
  const { data: rows = [], isLoading, refetch } = useCorridorRailPolicies();
  const { data: paymentPartners = [] } = usePaymentPartners();
  const save = useSaveCorridorRailPolicy();
  const del = useDeleteCorridorRailPolicy();
  const [form, setForm] = useState(emptyForm);

  const activeRails = useMemo(
    () => activeRailSetFromPartners(paymentPartners),
    [paymentPartners],
  );
  const railOff = (id: string) => !activeRails.has((id || "").toLowerCase());

  const editing = !!form.id;
  const { currency, country } = parseCorridor(form.corridorKey);
  const available = partnersFor(form.direction, currency);
  const preferredMeta = available.find((p) => p.id === form.preferred_partner);
  const backups = available.filter((p) => p.id !== form.preferred_partner);

  // Keep preferred valid when direction/corridor changes; skip inactive for auto-pick
  const effectivePreferred =
    preferredMeta?.id ||
    (available.find((p) => !railOff(p.id))?.id ?? available[0]?.id ?? "");

  const corridorLabel = useMemo(() => {
    const hit = CORRIDORS.find((c) => corridorKey(c.currency, c.country) === form.corridorKey);
    if (hit) return `${hit.currencyLabel} · ${hit.countryLabel}`;
    return `${currency}${country ? ` · ${country}` : ""}`;
  }, [form.corridorKey, currency, country]);

  const plainSummary = useMemo(() => {
    if (!effectivePreferred) {
      return "Pick a main provider below to see a plain-English summary.";
    }
    const action =
      form.direction === "payout"
        ? `When a customer sends ${currency}${country ? ` to ${country}` : ""}`
        : `When a customer tops up a ${currency} wallet${country ? ` (${country})` : ""}`;
    const main = partnerName(effectivePreferred);
    const fail = form.failover_partners
      .filter((id) => id !== effectivePreferred && available.some((p) => p.id === id))
      .map(partnerName);
    if (!fail.length) {
      return `${action}, always use ${main}. If that fails, hold the money and email ops — no automatic backup.`;
    }
    return `${action}, try ${main} first. If that fails, try ${fail.join(", then ")}. If all fail, hold the money and email ops.`;
  }, [form.direction, form.failover_partners, currency, country, effectivePreferred, available]);

  const onEdit = (r: CorridorRailPolicy) => {
    const key = corridorKey(r.currency_code, r.country_code || "");
    const hasCorridor = CORRIDORS.some((c) => corridorKey(c.currency, c.country) === key);
    setForm({
      id: r.id,
      direction: r.direction,
      corridorKey: hasCorridor ? key : corridorKey(r.currency_code, ""),
      preferred_partner: r.preferred_partner,
      failover_partners: r.failover_partners || [],
      enabled: r.enabled,
      notes: r.notes || "",
    });
  };

  const applyContext = (direction: RailDirection, key: string) => {
    const { currency: ccy, country: cc } = parseCorridor(key);
    const nextAvailable = partnersFor(direction, ccy);
    const existing = findPolicy(rows, direction, ccy, cc);
    const fallback =
      (direction === "collect" ? defaultCollectPartner(ccy) : defaultPayoutPartner(ccy)) ||
      nextAvailable[0]?.id ||
      "";
    const preferred =
      existing?.preferred_partner
      || (nextAvailable.some((p) => p.id === fallback) ? fallback : nextAvailable[0]?.id || "");
    setForm((f) => ({
      ...f,
      id: existing?.id || "",
      direction,
      corridorKey: key,
      preferred_partner: preferred,
      failover_partners: existing?.failover_partners || [],
      enabled: existing ? existing.enabled : true,
      notes: existing?.notes || "",
    }));
  };

  const setDirection = (direction: RailDirection) => {
    applyContext(direction, form.corridorKey);
  };

  const setCorridor = (key: string) => {
    applyContext(form.direction, key);
  };

  const toggleBackup = (id: string) => {
    setForm((f) => {
      if (f.failover_partners.includes(id)) {
        return { ...f, failover_partners: f.failover_partners.filter((x) => x !== id) };
      }
      return { ...f, failover_partners: [...f.failover_partners, id] };
    });
  };

  const moveBackup = (id: string, dir: -1 | 1) => {
    setForm((f) => {
      const list = [...f.failover_partners];
      const i = list.indexOf(id);
      if (i < 0) return f;
      const j = i + dir;
      if (j < 0 || j >= list.length) return f;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...f, failover_partners: list };
    });
  };

  const onSave = async () => {
    const preferred = effectivePreferred;
    if (!preferred) {
      toast.error("No provider works for this currency + direction. Pick another corridor.");
      return;
    }
    if (railOff(preferred)) {
      toast.error("That provider is inactive on the Partners tab. Turn it back on there, or pick another.");
      return;
    }
    try {
      await save.mutateAsync({
        id: form.id,
        direction: form.direction,
        country_code: country,
        currency_code: currency,
        preferred_partner: preferred,
        failover_partners: form.failover_partners.filter(
          (id) => id !== preferred && available.some((p) => p.id === id),
        ),
        enabled: form.enabled,
        notes: form.notes,
      });
      toast.success(editing ? "Saved" : "Added");
      setForm(emptyForm);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        `${a.direction}${a.currency_code}${a.country_code}`.localeCompare(
          `${b.direction}${b.currency_code}${b.country_code}`,
        ),
      ),
    [rows],
  );

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Who should move the money?</CardTitle>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              This page decides <strong className="text-foreground">which payment company</strong> we use for a currency —
              for <em>sends</em> and for <em>wallet top-ups</em>.
            </p>
            <p>
              <strong className="text-foreground">Top-up:</strong> pick “Customers topping up a wallet”, choose CAD or NGN,
              set the main provider (Square for CAD, Fincra for NGN by default), then save. The top-up page follows that rule.
            </p>
            <p>
              Turn a partner off on the <strong className="text-foreground">Partners</strong> tab and their rules
              here show as <strong className="text-foreground">Inactive</strong> — we stop using them for top-up and send.
            </p>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-8">
          {/* Step 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">1</span>
              <h3 className="font-semibold text-base">What are you setting up?</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDirection("payout")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  form.direction === "payout"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <div className="font-medium">Customers sending money out</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Payouts from a wallet to a bank / MoMo account.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDirection("collect")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  form.direction === "collect"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <div className="font-medium">Customers topping up a wallet</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Collecting money in (card, Interac, MoMo, etc.).
                </p>
              </button>
            </div>
          </section>

          {/* Step 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">2</span>
              <h3 className="font-semibold text-base">Which money corridor?</h3>
            </div>
            <Select value={form.corridorKey} onValueChange={setCorridor}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pick currency + country" />
              </SelectTrigger>
              <SelectContent>
                {CORRIDORS.map((c) => (
                  <SelectItem key={corridorKey(c.currency, c.country)} value={corridorKey(c.currency, c.country)}>
                    {c.currencyLabel} → {c.countryLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only real corridors we support are listed. You can’t invent a currency.
            </p>
          </section>

          {/* Step 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">3</span>
              <h3 className="font-semibold text-base">Main provider (try this first)</h3>
            </div>
            {!available.length ? (
              <p className="text-sm text-destructive">
                No provider is wired for this combo. Switch direction or corridor.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {available.map((p) => {
                  const selected = (form.preferred_partner || effectivePreferred) === p.id;
                  const inactive = railOff(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={inactive && !selected}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          preferred_partner: p.id,
                          failover_partners: f.failover_partners.filter((x) => x !== p.id),
                        }))
                      }
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : "border-border hover:bg-muted/50",
                        inactive && "opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {inactive && <Badge variant="outline">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{p.blurb}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Step 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">4</span>
              <h3 className="font-semibold text-base">Backups if the main one fails (optional)</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Leave empty if you want <strong>only</strong> the main provider. Order matters —
              we try #1, then #2, and so on.
            </p>
            {!backups.length ? (
              <p className="text-sm text-muted-foreground">No other providers for this corridor.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {backups.map((p) => {
                  const on = form.failover_partners.includes(p.id);
                  const order = form.failover_partners.indexOf(p.id);
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-xl border p-3 flex gap-3 items-start",
                        on ? "border-primary/40 bg-primary/5" : "border-border",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleBackup(p.id)}
                        disabled={railOff(p.id) && !on}
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0 rounded border flex items-center justify-center text-xs font-bold",
                          on ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/40",
                          railOff(p.id) && !on && "opacity-40",
                        )}
                        aria-pressed={on}
                      >
                        {on ? order + 1 : ""}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{p.name}</span>
                          {railOff(p.id) && <Badge variant="outline">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{p.blurb}</p>
                      </div>
                      {on && (
                        <div className="flex flex-col gap-0.5">
                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={() => moveBackup(p.id, -1)} disabled={order <= 0}>↑</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={() => moveBackup(p.id, 1)} disabled={order === form.failover_partners.length - 1}>↓</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-muted/40 p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In plain English</div>
            <p className="text-sm leading-relaxed">{plainSummary}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
              <span>{form.direction === "payout" ? "Send" : "Top-up"}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{corridorLabel}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{partnerName(effectivePreferred) || "—"}</span>
            </p>
          </section>

          <div className="space-y-2">
            <Label>Note for your team (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Flovide down today — using Fincra"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
              <Label>Turn this rule on</Label>
            </div>
            <div className="flex gap-2">
              {editing && (
                <Button variant="outline" onClick={() => setForm(emptyForm)}>Cancel edit</Button>
              )}
              <Button onClick={onSave} disabled={save.isPending || !effectivePreferred}>
                {editing ? <Pencil className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                {editing ? "Save changes" : "Save this rule"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top-up primaries in effect</CardTitle>
          <CardDescription>
            What the wallet top-up page uses right now. Saved rules override the built-in default. Click a row to edit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wallet</TableHead>
                <TableHead>Main provider</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(["CAD", "USD", "EUR", "GBP", "NGN", "GHS", "KES", "UGX", "TZS", "RWF", "ZMW", "ZAR", "XOF", "XAF"] as const).map((ccy) => {
                const saved = rows.find((r) => r.direction === "collect" && r.currency_code === ccy && r.enabled);
                const liveSaved = saved && !railOff(saved.preferred_partner) ? saved : undefined;
                const partner = liveSaved?.preferred_partner || defaultCollectPartner(ccy);
                if (!partner) return null;
                const inactive = railOff(partner);
                return (
                  <TableRow
                    key={ccy}
                    className="cursor-pointer"
                    onClick={() => {
                      const key = saved
                        ? corridorKey(saved.currency_code, saved.country_code || "")
                        : corridorKey(ccy, CORRIDORS.find((c) => c.currency === ccy)?.country || "");
                      applyContext("collect", key);
                    }}
                  >
                    <TableCell className="font-medium">{ccy}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        {partnerName(partner)}
                        {inactive && <Badge variant="outline">Inactive</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={liveSaved ? "default" : "outline"}>
                        {liveSaved ? "Saved rule" : "Built-in default"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Rules you already saved</CardTitle>
            <CardDescription>Edit or delete anytime. No saved top-up rule = built-in default (Square west, Fincra Africa).</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>Refresh</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Corridor</TableHead>
                  <TableHead>Main</TableHead>
                  <TableHead>Backups</TableHead>
                  <TableHead>On?</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {r.direction === "payout" ? "Send" : "Top-up"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.currency_code}
                      {r.country_code ? ` → ${r.country_code}` : " (anywhere)"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        {partnerName(r.preferred_partner)}
                        {railOff(r.preferred_partner) && <Badge variant="outline">Inactive</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {(r.failover_partners || []).map((id) =>
                        railOff(id) ? `${partnerName(id)} (inactive)` : partnerName(id),
                      ).join(" → ") || "None"}
                    </TableCell>
                    <TableCell>
                      {railOff(r.preferred_partner) ? "No" : r.enabled ? "Yes" : "No"}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Delete this rule?")) return;
                          try {
                            await del.mutateAsync(r.id);
                            toast.success("Deleted");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Delete failed");
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!sorted.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground text-sm">
                      No rules yet. Use the steps above — start with Nigeria send if you’re testing.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
