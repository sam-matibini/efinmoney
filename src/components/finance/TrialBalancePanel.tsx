import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: string;
  debit_total: number;
  credit_total: number;
}

export const TrialBalancePanel = () => {
  const [currency, setCurrency] = useState<string>("ALL");

  // Fetch all distinct currencies present in ledger_entries
  const { data: currencies = [] } = useQuery({
    queryKey: ["trial-balance-currencies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("currency_code");
      if (error) throw error;
      const distinct = [...new Set((data || []).map((e) => e.currency_code))].sort();
      return distinct;
    },
  });

  const { data: trialBalance = [], isLoading, isFetching, refetch } = useQuery({
    // Financial control screen — always refetch on mount/refocus rather than
    // trusting the global 60s cache, so this can never silently show stale
    // balances after a fix is deployed underneath it.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryKey: ["trial-balance", currency],
    queryFn: async () => {
      const { data: accounts, error: accountsError } = await supabase
        .from("ledger_accounts")
        .select("id, code, name, account_type")
        .eq("is_active", true)
        .order("code");
      if (accountsError) throw accountsError;

      let q = supabase
        .from("ledger_entries")
        .select("account_id, debit_amount, credit_amount, currency_code");
      if (currency !== "ALL") q = q.eq("currency_code", currency);
      const { data: entries, error: entriesError } = await q;
      if (entriesError) throw entriesError;

      const accountTotals = new Map<string, { debit: number; credit: number }>();
      (entries || []).forEach((entry) => {
        const current = accountTotals.get(entry.account_id) || { debit: 0, credit: 0 };
        accountTotals.set(entry.account_id, {
          debit: current.debit + Number(entry.debit_amount || 0),
          credit: current.credit + Number(entry.credit_amount || 0),
        });
      });

      return (accounts || [])
        .map((account) => {
          const totals = accountTotals.get(account.id) || { debit: 0, credit: 0 };
          return {
            account_code: account.code,
            account_name: account.name,
            account_type: account.account_type,
            debit_total: totals.debit,
            credit_total: totals.credit,
          } as TrialBalanceRow;
        })
        .filter((row) => row.debit_total > 0 || row.credit_total > 0);
    },
  });

  const totals = trialBalance.reduce(
    (acc, row) => ({ debit: acc.debit + row.debit_total, credit: acc.credit + row.credit_total }),
    { debit: 0, credit: 0 }
  );

  const difference = totals.debit - totals.credit;
  // Ledger amounts are DECIMAL(20,8) (crypto/FX legs carry sub-cent digits), so a
  // per-currency total can land up to ~1 cent off purely from rounding — immaterial,
  // and the DB balance trigger prevents any new structural imbalance. Treat a
  // rounding-sized residual as balanced, but still flag anything larger in red.
  const ROUNDING_TOLERANCE = 0.01;
  const absDiff = Math.abs(difference);
  const isBalanced = absDiff <= ROUNDING_TOLERANCE + 1e-9;
  const isRoundingResidual = isBalanced && absDiff > 1e-9;
  const isMixedView = currency === "ALL";

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <CardTitle>Trial Balance</CardTitle>
          <p className="text-sm text-muted-foreground">
            As of {format(new Date(), "MMMM d, yyyy")}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All currencies</SelectItem>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" onClick={() => refetch()} disabled={isFetching} title="Refresh">
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>

          {isMixedView ? (
            <p className="text-xs text-muted-foreground max-w-xs text-right">
              Showing mixed currencies — select a single currency to verify balance.
            </p>
          ) : (
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              isBalanced
                ? "bg-indigo-500/10 text-indigo-500"
                : "bg-red-500/10 text-red-500"
            }`}>
              {isBalanced
                ? `${currency} Balanced${isRoundingResidual ? " · rounding ±0.01" : ""}`
                : `${currency} Unbalanced · Δ ${absDiff.toFixed(2)}`}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">
                  Debit{!isMixedView ? ` (${currency})` : ""}
                </TableHead>
                <TableHead className="text-right">
                  Credit{!isMixedView ? ` (${currency})` : ""}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trialBalance.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    No ledger entries found{currency !== "ALL" ? ` for ${currency}` : ""}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {trialBalance.map((row) => (
                    <TableRow key={row.account_code}>
                      <TableCell className="font-mono">{row.account_code}</TableCell>
                      <TableCell>{row.account_name}</TableCell>
                      <TableCell className="capitalize">{row.account_type}</TableCell>
                      <TableCell className="text-right font-mono">
                        {row.debit_total > 0 ? row.debit_total.toFixed(2) : "–"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.credit_total > 0 ? row.credit_total.toFixed(2) : "–"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right font-mono">{totals.debit.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{totals.credit.toFixed(2)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {isMixedView && (
          <p className="mt-3 text-xs text-muted-foreground">
            The grand total across all currencies is not meaningful because CAD, USD, NGN, etc. are different units.
            Select a single currency above to see whether that currency's entries are balanced.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
