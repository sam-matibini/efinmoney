import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

export const CashFlowPanel = () => {
  const { data: cashFlowData, isLoading } = useQuery({
    queryKey: ['cash-flow-statement'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      // Get all ledger entries for the current period
      const { data: entries, error: entriesError } = await supabase
        .from('ledger_entries')
        .select(`
          account_id,
          debit_amount,
          credit_amount,
          reference_type,
          created_at
        `)
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      if (entriesError) throw entriesError;

      // Get account details
      const { data: accounts, error: accountsError } = await supabase
        .from('ledger_accounts')
        .select('id, code, name, account_type');

      if (accountsError) throw accountsError;

      const accountMap = new Map(accounts?.map(a => [a.id, a]) || []);

      // Categorize cash flows
      let operatingInflows = 0;
      let operatingOutflows = 0;
      let investingInflows = 0;
      let investingOutflows = 0;
      let financingInflows = 0;
      let financingOutflows = 0;

      (entries || []).forEach(entry => {
        const account = accountMap.get(entry.account_id);
        if (!account) return;

        const netFlow = Number(entry.credit_amount || 0) - Number(entry.debit_amount || 0);
        const refType = entry.reference_type || '';

        // Categorize based on account type and reference
        if (account.code.startsWith('11') || account.code.startsWith('12')) {
          // Bank/clearing accounts - Operating
          if (refType === 'transfer' || refType === 'fx') {
            if (netFlow > 0) operatingInflows += netFlow;
            else operatingOutflows += Math.abs(netFlow);
          }
        } else if (account.code.startsWith('14') || account.code.startsWith('15')) {
          // Crypto/Fixed assets - Investing
          if (netFlow > 0) investingInflows += netFlow;
          else investingOutflows += Math.abs(netFlow);
        } else if (account.code.startsWith('21') || account.code.startsWith('22')) {
          // Customer liabilities/Pending - Financing
          if (netFlow > 0) financingInflows += netFlow;
          else financingOutflows += Math.abs(netFlow);
        } else if (account.account_type === 'income') {
          operatingInflows += Math.abs(netFlow);
        } else if (account.account_type === 'expense') {
          operatingOutflows += Math.abs(netFlow);
        }
      });

      const operatingNet = operatingInflows - operatingOutflows;
      const investingNet = investingInflows - investingOutflows;
      const financingNet = financingInflows - financingOutflows;
      const netChange = operatingNet + investingNet + financingNet;

      return {
        period: { start: monthStart, end: monthEnd },
        operating: { inflows: operatingInflows, outflows: operatingOutflows, net: operatingNet },
        investing: { inflows: investingInflows, outflows: investingOutflows, net: investingNet },
        financing: { inflows: financingInflows, outflows: financingOutflows, net: financingNet },
        netChange,
      };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = cashFlowData || {
    period: { start: new Date(), end: new Date() },
    operating: { inflows: 0, outflows: 0, net: 0 },
    investing: { inflows: 0, outflows: 0, net: 0 },
    financing: { inflows: 0, outflows: 0, net: 0 },
    netChange: 0,
  };

  const CashFlowSection = ({ 
    title, 
    inflows, 
    outflows, 
    net,
    icon: Icon,
  }: { 
    title: string; 
    inflows: number; 
    outflows: number; 
    net: number;
    icon: typeof TrendingUp;
  }) => (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cash In</p>
          <p className="text-lg font-mono text-indigo-600">+{inflows.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Cash Out</p>
          <p className="text-lg font-mono text-red-600">-{outflows.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Net</p>
          <p className={`text-lg font-mono font-semibold ${net >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
            {net >= 0 ? '+' : ''}{net.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow Statement</CardTitle>
        <p className="text-sm text-muted-foreground">
          For the period {format(data.period.start, 'MMMM d')} - {format(data.period.end, 'MMMM d, yyyy')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <CashFlowSection
          title="Operating Activities"
          inflows={data.operating.inflows}
          outflows={data.operating.outflows}
          net={data.operating.net}
          icon={TrendingUp}
        />

        <CashFlowSection
          title="Investing Activities"
          inflows={data.investing.inflows}
          outflows={data.investing.outflows}
          net={data.investing.net}
          icon={ArrowRight}
        />

        <CashFlowSection
          title="Financing Activities"
          inflows={data.financing.inflows}
          outflows={data.financing.outflows}
          net={data.financing.net}
          icon={TrendingDown}
        />

        <div className="p-4 bg-muted/50 rounded-lg border-2 border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Net Change in Cash</p>
              <p className="text-xs text-muted-foreground mt-1">
                Operating + Investing + Financing
              </p>
            </div>
            <p className={`text-2xl font-mono font-bold ${data.netChange >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
              {data.netChange >= 0 ? '+' : ''}{data.netChange.toFixed(2)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
