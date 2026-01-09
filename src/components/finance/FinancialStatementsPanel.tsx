import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface AccountBalance {
  code: string;
  name: string;
  account_type: string;
  balance: number;
}

export const FinancialStatementsPanel = () => {
  const { data: accountBalances = [], isLoading } = useQuery({
    queryKey: ['financial-statements'],
    queryFn: async () => {
      const { data: accounts, error: accountsError } = await supabase
        .from('ledger_accounts')
        .select('id, code, name, account_type')
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      const { data: entries, error: entriesError } = await supabase
        .from('ledger_entries')
        .select('account_id, debit_amount, credit_amount');

      if (entriesError) throw entriesError;

      const balanceMap = new Map<string, number>();
      (entries || []).forEach(entry => {
        const current = balanceMap.get(entry.account_id) || 0;
        balanceMap.set(
          entry.account_id,
          current + Number(entry.debit_amount || 0) - Number(entry.credit_amount || 0)
        );
      });

      return (accounts || []).map(account => ({
        code: account.code,
        name: account.name,
        account_type: account.account_type,
        balance: balanceMap.get(account.id) || 0,
      }));
    },
  });

  const assets = accountBalances.filter(a => a.account_type === 'asset' && a.balance !== 0);
  const liabilities = accountBalances.filter(a => a.account_type === 'liability' && a.balance !== 0);
  const income = accountBalances.filter(a => a.account_type === 'income' && a.balance !== 0);
  const expenses = accountBalances.filter(a => a.account_type === 'expense' && a.balance !== 0);

  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const totalIncome = income.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const totalExpenses = expenses.reduce((sum, a) => sum + a.balance, 0);
  const netIncome = totalIncome - totalExpenses;
  const equity = totalAssets - totalLiabilities;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Financial Statements</CardTitle>
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
    <Tabs defaultValue="balance-sheet" className="space-y-4">
      <TabsList>
        <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
        <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
      </TabsList>

      <TabsContent value="balance-sheet">
        <Card>
          <CardHeader>
            <CardTitle>Balance Sheet</CardTitle>
            <p className="text-sm text-muted-foreground">
              As of {format(new Date(), 'MMMM d, yyyy')}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Assets Section */}
            <div>
              <h3 className="font-semibold text-lg mb-3 text-foreground">Assets</h3>
              <div className="space-y-2">
                {assets.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No asset entries</p>
                ) : (
                  assets.map(account => (
                    <div key={account.code} className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-sm">
                        <span className="text-muted-foreground font-mono mr-2">{account.code}</span>
                        {account.name}
                      </span>
                      <span className="font-mono text-sm">{account.balance.toFixed(2)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between items-center pt-2 font-semibold">
                  <span>Total Assets</span>
                  <span className="font-mono">{totalAssets.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Liabilities Section */}
            <div>
              <h3 className="font-semibold text-lg mb-3 text-foreground">Liabilities</h3>
              <div className="space-y-2">
                {liabilities.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No liability entries</p>
                ) : (
                  liabilities.map(account => (
                    <div key={account.code} className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-sm">
                        <span className="text-muted-foreground font-mono mr-2">{account.code}</span>
                        {account.name}
                      </span>
                      <span className="font-mono text-sm">{Math.abs(account.balance).toFixed(2)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between items-center pt-2 font-semibold">
                  <span>Total Liabilities</span>
                  <span className="font-mono">{totalLiabilities.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Equity Section */}
            <div className="pt-4 border-t-2 border-border">
              <div className="flex justify-between items-center font-bold text-lg">
                <span>Total Equity</span>
                <span className="font-mono">{equity.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                (Assets - Liabilities)
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="income-statement">
        <Card>
          <CardHeader>
            <CardTitle>Income Statement</CardTitle>
            <p className="text-sm text-muted-foreground">
              For the period ending {format(new Date(), 'MMMM d, yyyy')}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Revenue Section */}
            <div>
              <h3 className="font-semibold text-lg mb-3 text-foreground">Revenue</h3>
              <div className="space-y-2">
                {income.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No revenue entries</p>
                ) : (
                  income.map(account => (
                    <div key={account.code} className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-sm">
                        <span className="text-muted-foreground font-mono mr-2">{account.code}</span>
                        {account.name}
                      </span>
                      <span className="font-mono text-sm">{Math.abs(account.balance).toFixed(2)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between items-center pt-2 font-semibold">
                  <span>Total Revenue</span>
                  <span className="font-mono">{totalIncome.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Expenses Section */}
            <div>
              <h3 className="font-semibold text-lg mb-3 text-foreground">Expenses</h3>
              <div className="space-y-2">
                {expenses.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No expense entries</p>
                ) : (
                  expenses.map(account => (
                    <div key={account.code} className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-sm">
                        <span className="text-muted-foreground font-mono mr-2">{account.code}</span>
                        {account.name}
                      </span>
                      <span className="font-mono text-sm">{account.balance.toFixed(2)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between items-center pt-2 font-semibold">
                  <span>Total Expenses</span>
                  <span className="font-mono">{totalExpenses.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Net Income */}
            <div className="pt-4 border-t-2 border-border">
              <div className={`flex justify-between items-center font-bold text-lg ${
                netIncome >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>Net Income</span>
                <span className="font-mono">{netIncome.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                (Total Revenue - Total Expenses)
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};
