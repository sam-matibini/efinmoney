import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterStatementRows, hasStatementFilters } from "@/lib/statementFilters";
import { StatementFilters } from "@/components/statement/StatementFilters";
import { useAuth } from "@/hooks/useAuth";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { useStatement } from "@/hooks/useStatement";
import { StatementTable } from "@/components/statement/StatementTable";
import { StatementActions } from "@/components/statement/StatementActions";
import { StatementBalanceCards } from "@/components/statement/StatementBalanceCards";
import { StatementNetHero } from "@/components/statement/StatementNetHero";
import AppPage from "@/components/layout/AppPage";
import { CurrencyFlag } from "@/components/ui/FlagImage";


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

  const rows = useMemo(
    () => filterStatementRows(rowsAll ?? [], { direction, search, from, to }),
    [rowsAll, direction, search, from, to],
  );

  const filtersActive = hasStatementFilters({ direction, search, from, to });
  const totalCount = rowsAll?.length ?? 0;

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
    <AppPage width="wide" innerClassName="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">Account Statement</h1>
            <p className="text-sm text-muted-foreground">
              A bank-style view of every credit and debit across your wallets.
            </p>
          </div>
          <StatementActions rows={rows} meta={meta} defaultEmail={user?.email || ""} />
        </motion.div>

        <StatementNetHero
          netByCurrency={netByCurrency}
          totalsIn={totalsIn}
          totalsOut={totalsOut}
          totalCount={totalCount}
        />

        <StatementBalanceCards
          totalsIn={totalsIn}
          totalsOut={totalsOut}
          netByCurrency={netByCurrency}
          variant="full"
        />

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
                      <span className="inline-flex items-center gap-2"><CurrencyFlag code={w.currency_code} size="sm" />{w.currency_code} — {w.currency_name}</span>
                    </SelectItem>

                  ))}
                </SelectContent>
              </Select>
            </div>
            <StatementFilters
              search={search}
              onSearchChange={setSearch}
              from={from}
              onFromChange={setFrom}
              to={to}
              onToChange={setTo}
              resultCount={rows.length}
              totalCount={totalCount}
            />
          </CardHeader>
          <CardContent>
            <StatementTable
              rows={rows}
              loading={isLoading}
              showBalance={walletFilter !== "all"}
              filtered={filtersActive}
              searchQuery={search}
            />
          </CardContent>
        </Card>
    </AppPage>
  );
};

export default TransfersListPage;
