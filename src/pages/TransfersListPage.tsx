import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { useStatement } from "@/hooks/useStatement";
import { StatementTable } from "@/components/statement/StatementTable";
import { StatementActions } from "@/components/statement/StatementActions";
import { currencySymbol } from "@/lib/currency";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TransfersListPage = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: wallets } = useWallets();
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [walletFilter, setWalletFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: rowsAll, isLoading } = useStatement(
    walletFilter === "all" ? null : walletFilter,
    500
  );

  const rows = useMemo(() => {
    let items = rowsAll ?? [];
    if (direction === "in") items = items.filter((r) => r.moneyIn > 0);
    if (direction === "out") items = items.filter((r) => r.moneyOut > 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (r) =>
          r.description.toLowerCase().includes(q) ||
          r.payee.toLowerCase().includes(q) ||
          r.reference.toLowerCase().includes(q) ||
          r.purpose.toLowerCase().includes(q)
      );
    }
    if (from) items = items.filter((r) => new Date(r.date) >= new Date(from));
    if (to) items = items.filter((r) => new Date(r.date) <= new Date(to + "T23:59:59"));
    return items;
  }, [rowsAll, direction, search, from, to]);

  // Balance totals = computed across ALL rows (not the filtered view) so the
  // tiles represent the user's true running balance per currency, not the
  // currently selected tab/filter window.
  const totalsIn = useMemo(
    () => (rowsAll ?? []).reduce<Record<string, number>>((a, r) => { if (r.moneyIn) a[r.currency] = (a[r.currency] || 0) + r.moneyIn; return a; }, {}),
    [rowsAll]
  );
  const totalsOut = useMemo(
    () => (rowsAll ?? []).reduce<Record<string, number>>((a, r) => { if (r.moneyOut) a[r.currency] = (a[r.currency] || 0) + r.moneyOut; return a; }, {}),
    [rowsAll]
  );
  const netByCurrency = useMemo(() => {
    const all = new Set([...Object.keys(totalsIn), ...Object.keys(totalsOut)]);
    const out: Record<string, number> = {};
    for (const c of all) out[c] = (totalsIn[c] || 0) - (totalsOut[c] || 0);
    return out;
  }, [totalsIn, totalsOut]);
  const renderTotals = (totals: Record<string, number>, sign: "+" | "-" | "") => {
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return `${sign}${fmt(0)}`;
    return entries.map(([c, v]) => `${sign}${currencySymbol(c)}${fmt(Math.abs(v))} ${c}`).join("  ·  ");
  };

  const accountHolder = profile?.full_name || profile?.email || user?.email || "Account holder";

  const selectedWallet = wallets?.find((w) => w.wallet_id === walletFilter);
  const meta = {
    title: walletFilter === "all"
      ? "eFinMoney Account Statement"
      : `${selectedWallet?.currency_code || ""} Wallet Statement`,
    subtitle: walletFilter === "all"
      ? "All wallets · All currencies"
      : `${selectedWallet?.currency_name || selectedWallet?.currency_code || "Wallet"} (${selectedWallet?.currency_code || ""})`,
    accountHolder,
    periodFrom: from || undefined,
    periodTo: to || undefined,
    currency: selectedWallet?.currency_code,
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">Account Statement</h1>
            <p className="text-sm text-muted-foreground">
              A bank-style view of every credit and debit across your wallets.
            </p>
          </div>
          <StatementActions rows={rows} meta={meta} defaultEmail={user?.email || ""} />
        </motion.div>

        {/* Balance Totals (across the whole statement) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-emerald-500/[0.04] p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total Money In</div>
            <div className="text-xl sm:text-2xl font-display font-bold text-primary tabular-nums break-words leading-tight">
              {renderTotals(totalsIn, "+")}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-rose-500/[0.04] p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total Money Out</div>
            <div className="text-xl sm:text-2xl font-display font-bold text-destructive tabular-nums break-words leading-tight">
              {renderTotals(totalsOut, "-")}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-primary/[0.06] p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Net Balance</div>
            <div className="text-xl sm:text-2xl font-display font-bold text-foreground tabular-nums break-words leading-tight">
              {renderTotals(netByCurrency, "")}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <Tabs value={direction} onValueChange={(v) => setDirection(v as any)} className="flex-1">
                <TabsList className="grid grid-cols-3 w-full md:w-auto">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="in">Received</TabsTrigger>
                  <TabsTrigger value="out">Sent</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={walletFilter} onValueChange={setWalletFilter}>
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Filter by wallet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All wallets</SelectItem>
                  {wallets?.map((w) => (
                    <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      {w.flag_emoji ? `${w.flag_emoji} ` : ""}{w.currency_code} — {w.currency_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search description, payee, reference, purpose" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            <StatementTable rows={rows} loading={isLoading} showBalance={walletFilter !== "all"} />
          </CardContent>
        </Card>
      </main>
      <MobileNav />
    </div>
  );
};

export default TransfersListPage;
