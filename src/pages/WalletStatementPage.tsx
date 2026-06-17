import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wallet } from "lucide-react";
import { filterStatementRows, hasStatementFilters } from "@/lib/statementFilters";
import { StatementFilters } from "@/components/statement/StatementFilters";
import { useAuth } from "@/hooks/useAuth";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { useStatement } from "@/hooks/useStatement";
import { StatementTable } from "@/components/statement/StatementTable";
import { StatementActions } from "@/components/statement/StatementActions";
import { flagForCurrency } from "@/lib/flags";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const WalletStatementPage = () => {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: wallets } = useWallets();
  const wallet = wallets?.find((w) => w.wallet_id === walletId);

  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: rowsAll, isLoading } = useStatement(walletId || null, 1000);

  const rows = useMemo(
    () => filterStatementRows(rowsAll ?? [], { direction, search, from, to }),
    [rowsAll, direction, search, from, to],
  );

  const filtersActive = hasStatementFilters({ direction, search, from, to });
  const totalCount = rowsAll?.length ?? 0;

  // Balance totals span the entire wallet history (not the filtered view).
  const totalIn = (rowsAll ?? []).reduce((s, r) => s + r.moneyIn, 0);
  const totalOut = (rowsAll ?? []).reduce((s, r) => s + r.moneyOut, 0);
  const netBalance = totalIn - totalOut;

  const accountHolder = profile?.full_name || profile?.email || user?.email || "Account holder";

  const meta = {
    title: `${wallet?.currency_code || "Wallet"} Wallet Statement`,
    subtitle: `${wallet?.currency_name || ""} (${wallet?.currency_code || ""})`,
    accountHolder,
    accountEmail: profile?.email || user?.email || "",
    accountNumber: profile?.account_number || undefined,
    efinTag: profile?.efin_tag || undefined,
    periodFrom: from || undefined,
    periodTo: to || undefined,
    currency: wallet?.currency_code,
  };

  const flag = wallet ? (flagForCurrency(wallet.currency_code) !== "🌍" ? flagForCurrency(wallet.currency_code) : wallet.flag_emoji || "💰") : "💰";

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6 max-w-7xl mx-auto space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/dashboard");
            }
          }}
          className="-ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to dashboard
        </Button>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="gradient-primary text-primary-foreground overflow-hidden relative">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-primary-foreground/80 text-xs uppercase tracking-wider">
                    <Wallet className="w-3.5 h-3.5" /> Wallet Statement
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-3">
                    <span className="text-3xl">{flag}</span>
                    {wallet?.currency_name || wallet?.currency_code || "Wallet"}
                  </h1>
                  <p className="text-primary-foreground/70 text-sm">
                    Current balance: <span className="font-semibold">{wallet ? `${fmt(Number(wallet.balance))} ${wallet.currency_code}` : "—"}</span>
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-primary-foreground/80 pt-1">
                    <span><strong>Holder:</strong> {accountHolder}</span>
                    {profile?.account_number && <span><strong>Acct:</strong> {profile.account_number}</span>}
                    {profile?.efin_tag && <span><strong>Tag:</strong> @{profile.efin_tag}</span>}
                  </div>
                </div>
                <div className="shrink-0">
                  <StatementActions rows={rows} meta={meta} defaultEmail={user?.email || ""} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Balance Totals (whole wallet history) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-indigo-500/[0.04] p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total Money In</div>
            <div className="text-xl sm:text-2xl font-display font-bold text-primary tabular-nums">
              +{fmt(totalIn)} {wallet?.currency_code}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-rose-500/[0.04] p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total Money Out</div>
            <div className="text-xl sm:text-2xl font-display font-bold text-destructive tabular-nums">
              -{fmt(totalOut)} {wallet?.currency_code}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-primary/[0.06] p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Net Balance</div>
            <div className="text-xl sm:text-2xl font-display font-bold text-foreground tabular-nums">
              {netBalance >= 0 ? "+" : "-"}{fmt(Math.abs(netBalance))} {wallet?.currency_code}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <Tabs value={direction} onValueChange={(v) => setDirection(v as any)}>
                <TabsList className="grid grid-cols-3 w-full md:w-auto">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="in">Received</TabsTrigger>
                  <TabsTrigger value="out">Sent</TabsTrigger>
                </TabsList>
              </Tabs>
              <StatementActions rows={rows} meta={meta} defaultEmail={user?.email || ""} />
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
              showBalance
              filtered={filtersActive}
              searchQuery={search}
            />
          </CardContent>
        </Card>
      </main>
      <MobileNav />
    </div>
  );
};

export default WalletStatementPage;
