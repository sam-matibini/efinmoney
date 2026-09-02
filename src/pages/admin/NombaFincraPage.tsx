import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  RefreshCw, ExternalLink, Activity, ArrowDownLeft, ArrowUpRight, TrendingUp,
} from "lucide-react";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  usePaymentPartners,
  useUpdatePartner,
  usePartnerFxRates,
  useRefreshPartnerLiveRates,
  isPartnerActive,
} from "@/hooks/usePartnerNetwork";
import { useCorridorRailPolicies } from "@/lib/corridorRails";
import { cn } from "@/lib/utils";

const PRIMARY = ["nomba", "fincra"] as const;
type ProviderCode = (typeof PRIMARY)[number];

type TxKind = "payout" | "collect" | "interac";

type UnifiedTx = {
  id: string;
  provider: ProviderCode;
  kind: TxKind;
  reference: string;
  providerRef: string | null;
  amount: number;
  currency: string;
  status: string;
  detail: string;
  failure: string | null;
  createdAt: string;
  transferId: string | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  completed: "default",
  success: "default",
  paid: "default",
  credited: "default",
  processing: "secondary",
  pending: "outline",
  initiated: "outline",
  failed: "destructive",
  cancelled: "destructive",
  expired: "destructive",
};

function money(n: number, ccy: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: ccy || "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${ccy}`;
  }
}

function usePrimaryProviderTx() {
  return useQuery({
    queryKey: ["admin-nomba-fincra-tx"],
    queryFn: async (): Promise<UnifiedTx[]> => {
      const [
        nombaPayouts,
        nombaCollect,
        fincraInterac,
        transfers,
      ] = await Promise.all([
        supabase
          .from("nomba_payout_transactions")
          .select(
            "id, reference, provider_reference, amount, currency, status, account_name, account_number, bank_code, failure_reason, transfer_id, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("nomba_pay_transactions")
          .select(
            "id, reference, provider_reference, amount, currency, status, corridor, failure_reason, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("fincra_cad_interac_intents")
          .select(
            "id, reference, provider_reference, amount, currency_code, status, purpose, unmatched_reason, transfer_id, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("transfers")
          .select(
            "id, status, source_amount, source_currency, target_amount, target_currency, recipient_name, recipient_country, provider_charge_id, provider_reference, rails_attempted, failure_reason, created_at",
          )
          .or(
            "provider_charge_id.ilike.%nomba%,provider_charge_id.ilike.%fincra%,rails_attempted.cs.{nomba},rails_attempted.cs.{fincra}",
          )
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const rows: UnifiedTx[] = [];

      for (const r of nombaPayouts.data ?? []) {
        rows.push({
          id: `np-${r.id}`,
          provider: "nomba",
          kind: "payout",
          reference: r.reference,
          providerRef: r.provider_reference,
          amount: Number(r.amount),
          currency: r.currency || "NGN",
          status: r.status,
          detail: [r.account_name, r.account_number, r.bank_code].filter(Boolean).join(" · ") || "Nomba payout",
          failure: r.failure_reason,
          createdAt: r.created_at,
          transferId: r.transfer_id,
        });
      }

      for (const r of nombaCollect.data ?? []) {
        rows.push({
          id: `nc-${r.id}`,
          provider: "nomba",
          kind: "collect",
          reference: r.reference,
          providerRef: r.provider_reference,
          amount: Number(r.amount),
          currency: r.currency,
          status: r.status,
          detail: r.corridor ? `Checkout · ${r.corridor}` : "Nomba checkout",
          failure: r.failure_reason,
          createdAt: r.created_at,
          transferId: null,
        });
      }

      for (const r of fincraInterac.data ?? []) {
        rows.push({
          id: `fi-${r.id}`,
          provider: "fincra",
          kind: "interac",
          reference: r.reference,
          providerRef: r.provider_reference,
          amount: Number(r.amount),
          currency: r.currency_code || "CAD",
          status: r.status,
          detail: r.purpose ? `Interac · ${r.purpose}` : "CAD Interac",
          failure: r.unmatched_reason,
          createdAt: r.created_at,
          transferId: r.transfer_id,
        });
      }

      const seenTransfer = new Set(
        rows.map((t) => t.transferId).filter(Boolean) as string[],
      );

      for (const t of transfers.data ?? []) {
        const charge = String(t.provider_charge_id || "").toLowerCase();
        const rails = (t.rails_attempted || []).map((x) => String(x).toLowerCase());
        const isNomba = charge.includes("nomba") || rails.includes("nomba");
        const isFincra = charge.includes("fincra") || rails.includes("fincra");
        if (!isNomba && !isFincra) continue;
        if (seenTransfer.has(t.id)) continue;

        const provider: ProviderCode = isNomba && !isFincra
          ? "nomba"
          : isFincra && !isNomba
          ? "fincra"
          : charge.includes("nomba")
          ? "nomba"
          : rails.includes("nomba") && !rails.includes("fincra")
          ? "nomba"
          : "fincra";

        rows.push({
          id: `tr-${t.id}`,
          provider,
          kind: "payout",
          reference: t.id.slice(0, 8),
          providerRef: t.provider_reference,
          amount: Number(t.target_amount ?? t.source_amount),
          currency: t.target_currency || t.source_currency,
          status: t.status,
          detail: `${t.source_currency}→${t.target_currency} · ${t.recipient_name || "—"}${
            t.recipient_country ? ` (${t.recipient_country})` : ""
          }`,
          failure: t.failure_reason,
          createdAt: t.created_at,
          transferId: t.id,
        });
      }

      rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      return rows;
    },
    staleTime: 20_000,
  });
}

function PartnerControlCard({
  code,
  name,
  blurb,
}: {
  code: ProviderCode;
  name: string;
  blurb: string;
}) {
  const { data: partners = [], isLoading } = usePaymentPartners();
  const update = useUpdatePartner();
  const refreshRates = useRefreshPartnerLiveRates();
  const partner = partners.find((p) => p.code?.toLowerCase() === code);
  const active = partner ? isPartnerActive(partner) : false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{name}</CardTitle>
            <CardDescription className="mt-1">{blurb}</CardDescription>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <Badge variant={active ? "default" : "outline"}>{active ? "Live" : "Off"}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Accept traffic</p>
            <p className="text-xs text-muted-foreground">
              Turns partner on/off and syncs matching corridor rails
            </p>
          </div>
          <Switch
            checked={active}
            disabled={!partner || update.isPending}
            onCheckedChange={(on) => {
              if (!partner) return;
              update.mutate({ id: partner.id, patch: { status: on ? "active" : "inactive" } });
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={refreshRates.isPending}
            onClick={() => refreshRates.mutate(code)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", refreshRates.isPending && "animate-spin")} />
            Pull FX rates
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/pricing?tab=partners&panel=fx">
              <TrendingUp className="h-3.5 w-3.5 mr-1" /> Rates
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/pricing?tab=partners&panel=pricing">Partner fees</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/pricing?tab=partners">
              Corridor rails <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/api">API probes</Link>
          </Button>
        </div>

        {!partner && !isLoading && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            No <code>{code}</code> row in payment_partners — seed or add it under Partners.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RailsSnapshot() {
  const { data: policies = [], isLoading } = useCorridorRailPolicies();
  const primary = useMemo(
    () =>
      policies.filter((p) => {
        const pref = (p.preferred_partner || "").toLowerCase();
        const fail = (p.failover_partners || []).map((x) => x.toLowerCase());
        return PRIMARY.includes(pref as ProviderCode) || fail.some((f) => PRIMARY.includes(f as ProviderCode));
      }),
    [policies],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Corridors using Nomba / Fincra</CardTitle>
        <CardDescription>
          Preferred + failover from corridor rails. Edit full rules on the rails board.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : primary.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No corridor policies mention Nomba or Fincra yet.
          </p>
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
                {primary.map((p) => (
                  <TableRow key={p.id} className={!p.enabled ? "opacity-50" : undefined}>
                    <TableCell className="capitalize text-xs">{p.direction}</TableCell>
                    <TableCell className="font-medium">
                      {p.currency_code}
                      {p.country_code ? ` · ${p.country_code}` : ""}
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-3">
          <Button size="sm" variant="link" className="px-0" asChild>
            <Link to="/admin/pricing?tab=partners">Open corridor rails →</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RatesSnapshot({ partnerId, label }: { partnerId?: string; label: string }) {
  const { data: rates, isLoading, refetch, isFetching } = usePartnerFxRates(partnerId);
  const recent = (rates ?? []).slice(0, 12);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{label} FX</CardTitle>
          <CardDescription>Latest stored partner rates (live + manual)</CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        {!partnerId ? (
          <p className="text-sm text-muted-foreground">Partner not found in network.</p>
        ) : isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No rates yet — pull live or record manually.</p>
        ) : (
          <div className="overflow-x-auto max-h-56">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.base_currency}/{r.quote_currency}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.partner_rate}</TableCell>
                    <TableCell className="text-xs capitalize">{r.source === "api" ? "Live" : r.source}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(r.rate_timestamp), "dd MMM HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionsPanel({ providerFilter }: { providerFilter?: ProviderCode | "all" }) {
  const { data: rows = [], isLoading, refetch, isFetching } = usePrimaryProviderTx();
  const [kind, setKind] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (providerFilter && providerFilter !== "all" && r.provider !== providerFilter) return false;
      if (kind !== "all" && r.kind !== kind) return false;
      if (status !== "all" && r.status.toLowerCase() !== status) return false;
      if (!needle) return true;
      return (
        r.reference.toLowerCase().includes(needle)
        || (r.providerRef || "").toLowerCase().includes(needle)
        || r.detail.toLowerCase().includes(needle)
        || (r.transferId || "").toLowerCase().includes(needle)
        || (r.failure || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, providerFilter, kind, status, q]);

  const counts = useMemo(() => {
    const base = providerFilter && providerFilter !== "all"
      ? rows.filter((r) => r.provider === providerFilter)
      : rows;
    return {
      total: base.length,
      payout: base.filter((r) => r.kind === "payout").length,
      collect: base.filter((r) => r.kind === "collect" || r.kind === "interac").length,
      failed: base.filter((r) => /fail|cancel|error/i.test(r.status)).length,
    };
  }, [rows, providerFilter]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "In view", value: counts.total },
          { label: "Payouts", value: counts.payout },
          { label: "Collect / Interac", value: counts.collect },
          { label: "Failed-ish", value: counts.failed },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search ref, detail, transfer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="payout">Payout</SelectItem>
            <SelectItem value="collect">Collect</SelectItem>
            <SelectItem value="interac">Interac</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">completed</SelectItem>
            <SelectItem value="processing">processing</SelectItem>
            <SelectItem value="pending">pending</SelectItem>
            <SelectItem value="failed">failed</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isFetching && "animate-spin")} />
          Refresh
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/admin/ops-queue">Ops queue</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              No Nomba / Fincra transactions match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(r.createdAt), "dd MMM yy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">{r.provider}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1">
                          {r.kind === "payout" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownLeft className="h-3 w-3" />
                          )}
                          {r.kind}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {money(r.amount, r.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status.toLowerCase()] || "outline"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[140px] truncate" title={r.providerRef || r.reference}>
                        {r.providerRef || r.reference}
                      </TableCell>
                      <TableCell className="text-xs max-w-[280px]">
                        <div className="truncate" title={r.detail}>{r.detail}</div>
                        {r.failure && (
                          <div className="text-destructive truncate mt-0.5" title={r.failure}>
                            {r.failure}
                          </div>
                        )}
                        {r.transferId && (
                          <Link
                            className="text-primary underline-offset-2 hover:underline"
                            to={`/transfers/${r.transferId}`}
                          >
                            Transfer
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function NombaFincraPage() {
  const { data: partners = [] } = usePaymentPartners();
  const nomba = partners.find((p) => p.code?.toLowerCase() === "nomba");
  const fincra = partners.find((p) => p.code?.toLowerCase() === "fincra");
  const [tab, setTab] = useState("overview");

  return (
    <AdminLayout>
      <div className="max-w-[1400px] mx-auto space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6" />
              Nomba &amp; Fincra
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-1">
              Primary payment rails — turn them on/off, watch FX, and review every payout and collect
              that ran through Nomba or Fincra.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/pricing?tab=rate-card">Our customer fees</Link>
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">All transactions</TabsTrigger>
            <TabsTrigger value="nomba">Nomba</TabsTrigger>
            <TabsTrigger value="fincra">Fincra</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <PartnerControlCard
                code="nomba"
                name="Nomba"
                blurb="NGN bank + Global Payout (Africa MoMo, CAD/GBP/EUR/USD) and checkout collect"
              />
              <PartnerControlCard
                code="fincra"
                name="Fincra"
                blurb="Africa collect + payout corridors and CAD Interac Autodeposit"
              />
            </div>
            <RailsSnapshot />
            <div className="grid gap-4 lg:grid-cols-2">
              <RatesSnapshot partnerId={nomba?.id} label="Nomba" />
              <RatesSnapshot partnerId={fincra?.id} label="Fincra" />
            </div>
          </TabsContent>

          <TabsContent value="transactions">
            <TransactionsPanel providerFilter="all" />
          </TabsContent>

          <TabsContent value="nomba" className="space-y-4">
            <PartnerControlCard
              code="nomba"
              name="Nomba"
              blurb="Control Nomba live status and jump to rates / rails"
            />
            <RatesSnapshot partnerId={nomba?.id} label="Nomba" />
            <TransactionsPanel providerFilter="nomba" />
          </TabsContent>

          <TabsContent value="fincra" className="space-y-4">
            <PartnerControlCard
              code="fincra"
              name="Fincra"
              blurb="Control Fincra live status and jump to rates / rails"
            />
            <RatesSnapshot partnerId={fincra?.id} label="Fincra" />
            <TransactionsPanel providerFilter="fincra" />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
