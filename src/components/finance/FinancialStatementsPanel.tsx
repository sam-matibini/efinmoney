import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, startOfQuarter, endOfQuarter, subQuarters, differenceInDays } from "date-fns";
import { ChevronDown, ChevronRight, Calendar as CalendarIcon, Download, FileText, TrendingUp, TrendingDown, DollarSign, Wallet, Building2, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";

type CompareConfig = {
  enabled: boolean;
  compareType: 'previous_periods' | 'previous_years';
  numberOfPeriods: number;
  arrangeLatestFirst: boolean;
};

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  account_type: string;
  parent_id: string | null;
  balance: number;
  children?: AccountBalance[];
}

type DateRange = {
  from: Date;
  to: Date;
};

const ACCOUNT_CATEGORIES = {
  asset: {
    'Current Assets': ['1000', '1100', '1200', '1300', '1400', '1500', '1600'],
    'Fixed Assets': ['1700', '1800', '1900'],
    'Other Assets': ['1950', '1999'],
  },
  liability: {
    'Current Liabilities': ['2000', '2100', '2200', '2300', '2400', '2500'],
    'Long-term Liabilities': ['2600', '2700', '2800', '2900'],
  },
  equity: {
    'Equity': ['3000', '3100', '3200', '3300', '3900'],
  },
  income: {
    'Operating Revenue': ['4000', '4100', '4200', '4300', '4400'],
    'Other Income': ['4500', '4600', '4700', '4800', '4900'],
  },
  expense: {
    'Cost of Sales': ['5000', '5100', '5200'],
    'Operating Expenses': ['6000', '6100', '6200', '6300', '6400', '6500', '6600', '6700', '6800'],
    'Other Expenses': ['7000', '7100', '7200', '7900', '8000', '8100', '8900'],
  },
};

export const FinancialStatementsPanel = () => {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfYear(new Date()),
    to: new Date(),
  });
  const [reportPeriod, setReportPeriod] = useState("year_to_date");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Current Assets', 'Current Liabilities', 'Operating Revenue', 'Operating Expenses', 'Equity']));
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareConfig, setCompareConfig] = useState<CompareConfig>({
    enabled: false,
    compareType: 'previous_periods',
    numberOfPeriods: 1,
    arrangeLatestFirst: false,
  });
  const [tempCompareConfig, setTempCompareConfig] = useState<CompareConfig>(compareConfig);

  // Calculate comparison periods based on config
  const getComparisonPeriods = (): DateRange[] => {
    if (!compareConfig.enabled) return [];
    
    const periods: DateRange[] = [];
    const periodLengthDays = differenceInDays(dateRange.to, dateRange.from);
    
    for (let i = 1; i <= compareConfig.numberOfPeriods; i++) {
      if (compareConfig.compareType === 'previous_years') {
        const fromDate = subYears(dateRange.from, i);
        const toDate = subYears(dateRange.to, i);
        periods.push({ from: fromDate, to: toDate });
      } else {
        // Previous periods - shift back by the period length
        const fromDate = subDays(dateRange.from, periodLengthDays * i + i);
        const toDate = subDays(dateRange.to, periodLengthDays * i + i);
        periods.push({ from: fromDate, to: toDate });
      }
    }
    
    return compareConfig.arrangeLatestFirst ? periods : periods.reverse();
  };

  const comparisonPeriods = getComparisonPeriods();

  const handleApplyCompare = () => {
    setCompareConfig({ ...tempCompareConfig, enabled: true });
    setCompareDialogOpen(false);
  };

  const handleCancelCompare = () => {
    setTempCompareConfig(compareConfig);
    setCompareDialogOpen(false);
  };

  const handleClearCompare = () => {
    const clearedConfig: CompareConfig = {
      enabled: false,
      compareType: 'previous_periods',
      numberOfPeriods: 1,
      arrangeLatestFirst: false,
    };
    setCompareConfig(clearedConfig);
    setTempCompareConfig(clearedConfig);
    setCompareDialogOpen(false);
  };

  const handlePeriodChange = (period: string) => {
    setReportPeriod(period);
    const today = new Date();
    switch (period) {
      case "this_month":
        setDateRange({ from: startOfMonth(today), to: today });
        break;
      case "last_month":
        const lastMonth = subMonths(today, 1);
        setDateRange({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
        break;
      case "this_quarter":
        setDateRange({ from: startOfQuarter(today), to: today });
        break;
      case "last_quarter":
        const lastQuarter = subQuarters(today, 1);
        setDateRange({ from: startOfQuarter(lastQuarter), to: endOfQuarter(lastQuarter) });
        break;
      case "year_to_date":
        setDateRange({ from: startOfYear(today), to: today });
        break;
      case "last_year":
        const lastYear = subYears(today, 1);
        setDateRange({ from: startOfYear(lastYear), to: endOfYear(lastYear) });
        break;
      case "last_12_months":
        setDateRange({ from: subMonths(today, 12), to: today });
        break;
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const expandAll = () => {
    const allSections = new Set<string>();
    Object.values(ACCOUNT_CATEGORIES).forEach(categories => {
      Object.keys(categories).forEach(cat => allSections.add(cat));
    });
    setExpandedSections(allSections);
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  // Fetch balance data for a specific date range
  const fetchBalances = async (range: DateRange) => {
    const { data: accounts, error: accountsError } = await supabase
      .from('ledger_accounts')
      .select('id, code, name, account_type, parent_id')
      .eq('is_active', true)
      .order('code');

    if (accountsError) throw accountsError;

    const { data: entries, error: entriesError } = await supabase
      .from('ledger_entries')
      .select('account_id, debit_amount, credit_amount, created_at')
      .gte('created_at', range.from.toISOString())
      .lte('created_at', range.to.toISOString());

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
      id: account.id,
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      parent_id: account.parent_id,
      balance: balanceMap.get(account.id) || 0,
    }));
  };

  const { data: accountBalances = [], isLoading } = useQuery({
    queryKey: ['financial-statements', dateRange],
    queryFn: () => fetchBalances(dateRange),
  });

  // Fetch comparison period data
  const { data: comparisonData = [] } = useQuery({
    queryKey: ['financial-statements-comparison', dateRange, compareConfig],
    queryFn: async () => {
      if (!compareConfig.enabled || comparisonPeriods.length === 0) return [];
      
      const results = await Promise.all(
        comparisonPeriods.map(period => fetchBalances(period))
      );
      return results;
    },
    enabled: compareConfig.enabled && comparisonPeriods.length > 0,
  });

  // Helper to get comparison balance for an account
  const getComparisonBalance = (accountCode: string, periodIndex: number): number => {
    if (!comparisonData[periodIndex]) return 0;
    const account = comparisonData[periodIndex].find(a => a.code === accountCode);
    return account?.balance || 0;
  };

  // Calculate comparison totals
  const getComparisonCategoryTotal = (type: string, prefixes: string[], periodIndex: number): number => {
    if (!comparisonData[periodIndex]) return 0;
    return comparisonData[periodIndex]
      .filter(a => a.account_type === type && prefixes.some(p => a.code.startsWith(p)))
      .reduce((sum, a) => sum + (type === 'liability' || type === 'income' ? Math.abs(a.balance) : a.balance), 0);
  };

  const getComparisonTypeTotal = (type: string, periodIndex: number): number => {
    if (!comparisonData[periodIndex]) return 0;
    return comparisonData[periodIndex]
      .filter(a => a.account_type === type)
      .reduce((sum, a) => sum + (type === 'liability' || type === 'income' ? Math.abs(a.balance) : a.balance), 0);
  };

  const getAccountsByCategory = (type: string, prefixes: string[]) => {
    return accountBalances.filter(a => {
      const matchesType = a.account_type === type;
      const matchesPrefix = prefixes.some(p => a.code.startsWith(p));
      const hasBalance = showZeroBalances || a.balance !== 0;
      return matchesType && matchesPrefix && hasBalance;
    });
  };

  const getCategoryTotal = (type: string, prefixes: string[]) => {
    return accountBalances
      .filter(a => a.account_type === type && prefixes.some(p => a.code.startsWith(p)))
      .reduce((sum, a) => sum + (type === 'liability' || type === 'income' ? Math.abs(a.balance) : a.balance), 0);
  };

  const assets = accountBalances.filter(a => a.account_type === 'asset');
  const liabilities = accountBalances.filter(a => a.account_type === 'liability');
  const income = accountBalances.filter(a => a.account_type === 'income');
  const expenses = accountBalances.filter(a => a.account_type === 'expense');
  const equityAccounts = accountBalances.filter(a => a.account_type === 'equity');

  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const totalIncome = income.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const totalExpenses = expenses.reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = equityAccounts.reduce((sum, a) => sum + a.balance, 0);
  const netIncome = totalIncome - totalExpenses;
  const calculatedEquity = totalAssets - totalLiabilities;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Format period label for comparison columns
  const formatPeriodLabel = (period: DateRange): string => {
    if (compareConfig.compareType === 'previous_years') {
      return format(period.to, 'yyyy');
    }
    return `${format(period.from, 'MMM d')} - ${format(period.to, 'MMM d')}`;
  };

  const renderAccountSection = (
    title: string,
    type: string,
    prefixes: string[],
    icon: React.ReactNode
  ) => {
    const accounts = getAccountsByCategory(type, prefixes);
    const total = getCategoryTotal(type, prefixes);
    const isExpanded = expandedSections.has(title);
    const hasComparison = compareConfig.enabled && comparisonPeriods.length > 0;

    return (
      <Collapsible open={isExpanded} onOpenChange={() => toggleSection(title)}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {icon}
              <span className="font-semibold">{title}</span>
              <Badge variant="secondary" className="ml-2 text-xs">
                {accounts.length} accounts
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              {hasComparison && comparisonPeriods.map((period, idx) => (
                <span key={idx} className="font-mono text-sm text-muted-foreground">
                  {formatCurrency(getComparisonCategoryTotal(type, prefixes, idx))}
                </span>
              ))}
              <span className="font-mono font-semibold min-w-[100px] text-right">{formatCurrency(total)}</span>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-6 mt-1 space-y-1">
            {accounts.length === 0 ? (
              <p className="text-muted-foreground text-sm py-2 pl-4">No entries in this category</p>
            ) : (
              accounts.map(account => {
                const currentBalance = type === 'liability' || type === 'income' ? Math.abs(account.balance) : account.balance;
                return (
                  <div 
                    key={account.code} 
                    className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm flex-1">
                      <span className="text-muted-foreground font-mono mr-2">{account.code}</span>
                      {account.name}
                    </span>
                    <div className="flex items-center gap-4">
                      {hasComparison && comparisonPeriods.map((period, idx) => {
                        const compBalance = getComparisonBalance(account.code, idx);
                        const displayBalance = type === 'liability' || type === 'income' ? Math.abs(compBalance) : compBalance;
                        return (
                          <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                            {formatCurrency(displayBalance)}
                          </span>
                        );
                      })}
                      <span className="font-mono text-sm min-w-[100px] text-right">
                        {formatCurrency(currentBalance)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  // Render column headers when comparison is enabled
  const renderColumnHeaders = () => {
    if (!compareConfig.enabled || comparisonPeriods.length === 0) return null;
    
    return (
      <div className="flex items-center justify-end gap-4 mb-2 px-3 text-xs font-medium text-muted-foreground border-b pb-2">
        {comparisonPeriods.map((period, idx) => (
          <span key={idx} className="min-w-[90px] text-right">
            {formatPeriodLabel(period)}
          </span>
        ))}
        <span className="min-w-[100px] text-right font-semibold text-foreground">
          Current Period
        </span>
      </div>
    );
  };

  // Cash Flow Content Component - uses filtered date range
  const CashFlowContent = ({ 
    dateRange, 
    expandedSections, 
    toggleSection, 
    formatCurrency,
    compareConfig,
    comparisonPeriods,
  }: { 
    dateRange: DateRange;
    expandedSections: Set<string>;
    toggleSection: (section: string) => void;
    formatCurrency: (amount: number) => string;
    compareConfig: CompareConfig;
    comparisonPeriods: DateRange[];
  }) => {
    const { data: cashFlowData, isLoading: cfLoading } = useQuery({
      queryKey: ['cash-flow-statement', dateRange],
      queryFn: async () => {
        const { data: entries, error: entriesError } = await supabase
          .from('ledger_entries')
          .select(`
            account_id,
            debit_amount,
            credit_amount,
            reference_type,
            created_at
          `)
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());

        if (entriesError) throw entriesError;

        const { data: accounts, error: accountsError } = await supabase
          .from('ledger_accounts')
          .select('id, code, name, account_type');

        if (accountsError) throw accountsError;

        const accountMap = new Map(accounts?.map(a => [a.id, a]) || []);

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

          if (account.code.startsWith('11') || account.code.startsWith('12')) {
            if (refType === 'transfer' || refType === 'fx') {
              if (netFlow > 0) operatingInflows += netFlow;
              else operatingOutflows += Math.abs(netFlow);
            }
          } else if (account.code.startsWith('14') || account.code.startsWith('15')) {
            if (netFlow > 0) investingInflows += netFlow;
            else investingOutflows += Math.abs(netFlow);
          } else if (account.code.startsWith('21') || account.code.startsWith('22')) {
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
          operating: { inflows: operatingInflows, outflows: operatingOutflows, net: operatingNet },
          investing: { inflows: investingInflows, outflows: investingOutflows, net: investingNet },
          financing: { inflows: financingInflows, outflows: financingOutflows, net: financingNet },
          netChange,
        };
      },
    });

    // Fetch comparison cash flow data
    const { data: comparisonCashFlow = [] } = useQuery({
      queryKey: ['cash-flow-comparison', comparisonPeriods, compareConfig.enabled],
      queryFn: async () => {
        if (!compareConfig.enabled || comparisonPeriods.length === 0) return [];
        
        const results = await Promise.all(
          comparisonPeriods.map(async (period) => {
            const { data: entries } = await supabase
              .from('ledger_entries')
              .select('account_id, debit_amount, credit_amount, reference_type')
              .gte('created_at', period.from.toISOString())
              .lte('created_at', period.to.toISOString());

            const { data: accounts } = await supabase
              .from('ledger_accounts')
              .select('id, code, account_type');

            const accountMap = new Map(accounts?.map(a => [a.id, a]) || []);

            let operatingInflows = 0, operatingOutflows = 0;
            let investingInflows = 0, investingOutflows = 0;
            let financingInflows = 0, financingOutflows = 0;

            (entries || []).forEach(entry => {
              const account = accountMap.get(entry.account_id);
              if (!account) return;

              const netFlow = Number(entry.credit_amount || 0) - Number(entry.debit_amount || 0);
              const refType = entry.reference_type || '';

              if (account.code.startsWith('11') || account.code.startsWith('12')) {
                if (refType === 'transfer' || refType === 'fx') {
                  if (netFlow > 0) operatingInflows += netFlow;
                  else operatingOutflows += Math.abs(netFlow);
                }
              } else if (account.code.startsWith('14') || account.code.startsWith('15')) {
                if (netFlow > 0) investingInflows += netFlow;
                else investingOutflows += Math.abs(netFlow);
              } else if (account.code.startsWith('21') || account.code.startsWith('22')) {
                if (netFlow > 0) financingInflows += netFlow;
                else financingOutflows += Math.abs(netFlow);
              } else if (account.account_type === 'income') {
                operatingInflows += Math.abs(netFlow);
              } else if (account.account_type === 'expense') {
                operatingOutflows += Math.abs(netFlow);
              }
            });

            return {
              operating: { inflows: operatingInflows, outflows: operatingOutflows, net: operatingInflows - operatingOutflows },
              investing: { inflows: investingInflows, outflows: investingOutflows, net: investingInflows - investingOutflows },
              financing: { inflows: financingInflows, outflows: financingOutflows, net: financingInflows - financingOutflows },
              netChange: (operatingInflows - operatingOutflows) + (investingInflows - investingOutflows) + (financingInflows - financingOutflows),
            };
          })
        );
        return results;
      },
      enabled: compareConfig.enabled && comparisonPeriods.length > 0,
    });

    if (cfLoading) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Statement of Cash Flows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    const data = cashFlowData || {
      operating: { inflows: 0, outflows: 0, net: 0 },
      investing: { inflows: 0, outflows: 0, net: 0 },
      financing: { inflows: 0, outflows: 0, net: 0 },
      netChange: 0,
    };

    const hasComparison = compareConfig.enabled && comparisonPeriods.length > 0;

    const formatPeriodLabel = (period: DateRange): string => {
      if (compareConfig.compareType === 'previous_years') {
        return format(period.to, 'yyyy');
      }
      return `${format(period.from, 'MMM d')} - ${format(period.to, 'MMM d')}`;
    };

    const CashFlowSection = ({ 
      title, 
      inflows, 
      outflows, 
      net,
      bgColor,
      sectionKey,
      compData,
    }: { 
      title: string; 
      inflows: number; 
      outflows: number; 
      net: number;
      bgColor: string;
      sectionKey: 'operating' | 'investing' | 'financing';
      compData: typeof comparisonCashFlow;
    }) => (
      <Collapsible open={expandedSections.has(title)} onOpenChange={() => toggleSection(title)}>
        <CollapsibleTrigger className="w-full">
          <div className={cn("flex items-center justify-between py-2 px-3 rounded-lg hover:opacity-80 transition-colors", bgColor)}>
            <div className="flex items-center gap-2">
              {expandedSections.has(title) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-semibold">{title}</span>
            </div>
            <div className="flex items-center gap-4">
              {hasComparison && compData.map((cd, idx) => (
                <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                  {formatCurrency(cd[sectionKey]?.net || 0)}
                </span>
              ))}
              <span className={cn("font-mono font-semibold min-w-[100px] text-right", net >= 0 ? "text-indigo-600" : "text-red-600")}>
                {formatCurrency(net)}
              </span>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-6 mt-2 space-y-2">
            <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted">
              <span className="text-sm">Cash Inflows</span>
              <div className="flex items-center gap-4">
                {hasComparison && compData.map((cd, idx) => (
                  <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                    {formatCurrency(cd[sectionKey]?.inflows || 0)}
                  </span>
                ))}
                <span className="font-mono text-sm text-indigo-600 min-w-[100px] text-right">+{formatCurrency(inflows)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted">
              <span className="text-sm">Cash Outflows</span>
              <div className="flex items-center gap-4">
                {hasComparison && compData.map((cd, idx) => (
                  <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                    -{formatCurrency(cd[sectionKey]?.outflows || 0)}
                  </span>
                ))}
                <span className="font-mono text-sm text-red-600 min-w-[100px] text-right">-{formatCurrency(outflows)}</span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );

    return (
      <Card>
        <CardHeader>
          <CardTitle>Statement of Cash Flows</CardTitle>
          <CardDescription>
            For the period {format(dateRange.from, 'MMMM d, yyyy')} to {format(dateRange.to, 'MMMM d, yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasComparison && (
            <div className="flex items-center justify-end gap-4 mb-2 px-3 text-xs font-medium text-muted-foreground border-b pb-2">
              {comparisonPeriods.map((period, idx) => (
                <span key={idx} className="min-w-[90px] text-right">
                  {formatPeriodLabel(period)}
                </span>
              ))}
              <span className="min-w-[100px] text-right font-semibold text-foreground">
                Current Period
              </span>
            </div>
          )}

          <CashFlowSection
            title="Cash Flows from Operating Activities"
            inflows={data.operating.inflows}
            outflows={data.operating.outflows}
            net={data.operating.net}
            bgColor="bg-blue-500/10"
            sectionKey="operating"
            compData={comparisonCashFlow}
          />

          <CashFlowSection
            title="Cash Flows from Investing Activities"
            inflows={data.investing.inflows}
            outflows={data.investing.outflows}
            net={data.investing.net}
            bgColor="bg-purple-500/10"
            sectionKey="investing"
            compData={comparisonCashFlow}
          />

          <CashFlowSection
            title="Cash Flows from Financing Activities"
            inflows={data.financing.inflows}
            outflows={data.financing.outflows}
            net={data.financing.net}
            bgColor="bg-orange-500/10"
            sectionKey="financing"
            compData={comparisonCashFlow}
          />

          <div className="pt-4 border-t-2">
            <div className={cn(
              "flex justify-between items-center py-4 px-4 rounded-lg font-bold text-lg",
              data.netChange >= 0 ? "bg-indigo-500/20" : "bg-red-500/20"
            )}>
              <span>Net Change in Cash</span>
              <div className="flex items-center gap-4">
                {hasComparison && comparisonCashFlow.map((cd, idx) => (
                  <span key={idx} className={cn("font-mono text-sm min-w-[90px] text-right", (cd.netChange || 0) >= 0 ? "text-indigo-600/70" : "text-red-600/70")}>
                    {formatCurrency(cd.netChange || 0)}
                  </span>
                ))}
                <span className={cn("font-mono min-w-[100px] text-right", data.netChange >= 0 ? "text-indigo-600" : "text-red-600")}>
                  {formatCurrency(data.netChange)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Financial Statements</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Financial Statements
              </CardTitle>
              <CardDescription>Standard financial reports with detailed breakdowns</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={reportPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="this_quarter">This Quarter</SelectItem>
                  <SelectItem value="last_quarter">Last Quarter</SelectItem>
                  <SelectItem value="year_to_date">Year to Date</SelectItem>
                  <SelectItem value="last_year">Last Year</SelectItem>
                  <SelectItem value="last_12_months">Last 12 Months</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to });
                        setReportPeriod("custom");
                      }
                    }}
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              {/* Compare With Dialog */}
              <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    variant={compareConfig.enabled ? "default" : "outline"} 
                    size="sm"
                    className="gap-2"
                    onClick={() => setTempCompareConfig(compareConfig)}
                  >
                    <GitCompare className="h-4 w-4" />
                    Compare With
                    {compareConfig.enabled && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {compareConfig.numberOfPeriods} {compareConfig.compareType === 'previous_years' ? 'yr' : 'period'}
                      </Badge>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>Compare With</DialogTitle>
                    <DialogDescription>
                      Compare current period with previous periods or years
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Compare Based on Period/Year</Label>
                      <Select 
                        value={tempCompareConfig.compareType} 
                        onValueChange={(value: 'previous_periods' | 'previous_years') => 
                          setTempCompareConfig(prev => ({ ...prev, compareType: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="previous_periods">Previous Period(s)</SelectItem>
                          <SelectItem value="previous_years">Previous Year(s)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>
                        Number of {tempCompareConfig.compareType === 'previous_years' ? 'Year(s)' : 'Period(s)'}
                      </Label>
                      <Select 
                        value={String(tempCompareConfig.numberOfPeriods)} 
                        onValueChange={(value) => 
                          setTempCompareConfig(prev => ({ ...prev, numberOfPeriods: parseInt(value) }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                          <SelectItem value="5">5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="arrangeLatestFirst"
                        checked={tempCompareConfig.arrangeLatestFirst}
                        onCheckedChange={(checked) => 
                          setTempCompareConfig(prev => ({ ...prev, arrangeLatestFirst: checked as boolean }))
                        }
                      />
                      <Label htmlFor="arrangeLatestFirst" className="text-sm font-normal cursor-pointer">
                        Arrange period/year from latest to oldest
                      </Label>
                    </div>
                  </div>
                  <DialogFooter className="flex gap-2 sm:gap-0">
                    {compareConfig.enabled && (
                      <Button variant="ghost" onClick={handleClearCompare} className="mr-auto">
                        Clear
                      </Button>
                    )}
                    <Button variant="outline" onClick={handleCancelCompare}>
                      Cancel
                    </Button>
                    <Button onClick={handleApplyCompare}>
                      Apply
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
            <Button 
              variant={showZeroBalances ? "secondary" : "ghost"} 
              size="sm"
              onClick={() => setShowZeroBalances(!showZeroBalances)}
            >
              {showZeroBalances ? "Hide Zero Balances" : "Show Zero Balances"}
            </Button>
            <div className="ml-auto">
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statements Tabs */}
      <Tabs defaultValue="balance-sheet" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          <TabsTrigger value="changes-equity">Changes in Equity</TabsTrigger>
        </TabsList>

        {/* Balance Sheet */}
        <TabsContent value="balance-sheet">
          <Card>
            <CardHeader>
              <CardTitle>Statement of Financial Position</CardTitle>
              <CardDescription>
                As of {format(dateRange.to, 'MMMM d, yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Column Headers */}
              {renderColumnHeaders()}
              
              {/* Assets */}
              <div className="space-y-2">
                <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <Wallet className="h-5 w-5 text-blue-600" />
                  Assets
                </h3>
                {Object.entries(ACCOUNT_CATEGORIES.asset).map(([category, prefixes]) => (
                  <div key={category}>
                    {renderAccountSection(category, 'asset', prefixes, <DollarSign className="h-4 w-4 text-blue-500" />)}
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 px-3 bg-blue-500/10 rounded-lg font-bold">
                  <span>Total Assets</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => (
                      <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                        {formatCurrency(getComparisonTypeTotal('asset', idx))}
                      </span>
                    ))}
                    <span className="font-mono min-w-[100px] text-right">{formatCurrency(totalAssets)}</span>
                  </div>
                </div>
              </div>

              {/* Liabilities */}
              <div className="space-y-2">
                <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <Building2 className="h-5 w-5 text-orange-600" />
                  Liabilities
                </h3>
                {Object.entries(ACCOUNT_CATEGORIES.liability).map(([category, prefixes]) => (
                  <div key={category}>
                    {renderAccountSection(category, 'liability', prefixes, <DollarSign className="h-4 w-4 text-orange-500" />)}
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 px-3 bg-orange-500/10 rounded-lg font-bold">
                  <span>Total Liabilities</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => (
                      <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                        {formatCurrency(getComparisonTypeTotal('liability', idx))}
                      </span>
                    ))}
                    <span className="font-mono min-w-[100px] text-right">{formatCurrency(totalLiabilities)}</span>
                  </div>
                </div>
              </div>

              {/* Equity */}
              <div className="space-y-2">
                <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <TrendingUp className="h-5 w-5 text-indigo-600" />
                  Equity
                </h3>
                {renderAccountSection('Equity', 'equity', ACCOUNT_CATEGORIES.equity.Equity, <DollarSign className="h-4 w-4 text-indigo-500" />)}
                <div className="flex justify-between items-center py-2 px-3 border-l-2 border-muted ml-6">
                  <span className="text-sm italic">Retained Earnings (Assets − Liabilities)</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => {
                      const compAssets = getComparisonTypeTotal('asset', idx);
                      const compLiab = getComparisonTypeTotal('liability', idx);
                      const compCalcEquity = compAssets - compLiab;
                      return (
                        <span key={idx} className={cn("font-mono text-sm min-w-[90px] text-right", compCalcEquity >= 0 ? "text-indigo-600" : "text-red-600")}>
                          {formatCurrency(compCalcEquity)}
                        </span>
                      );
                    })}
                    <span className={cn("font-mono text-sm min-w-[100px] text-right", calculatedEquity >= 0 ? "text-indigo-600" : "text-red-600")}>
                      {formatCurrency(calculatedEquity)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center py-3 px-3 bg-indigo-500/10 rounded-lg font-bold">
                  <span>Total Equity</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => {
                      const compAssets = getComparisonTypeTotal('asset', idx);
                      const compLiab = getComparisonTypeTotal('liability', idx);
                      return (
                        <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                          {formatCurrency(compAssets - compLiab)}
                        </span>
                      );
                    })}
                    <span className="font-mono min-w-[100px] text-right">{formatCurrency(calculatedEquity)}</span>
                  </div>
                </div>
              </div>

              {/* Balance Check */}
              <div className="pt-4 border-t-2">
                <div className="flex justify-between items-center py-3 px-3 bg-primary/10 rounded-lg font-bold text-lg">
                  <span>Total Liabilities & Equity</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => {
                      const compAssets = getComparisonTypeTotal('asset', idx);
                      return (
                        <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                          {formatCurrency(compAssets)}
                        </span>
                      );
                    })}
                    <span className="font-mono min-w-[100px] text-right">{formatCurrency(totalAssets)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Income Statement */}
        <TabsContent value="income-statement">
          <Card>
            <CardHeader>
              <CardTitle>Statement of Profit or Loss</CardTitle>
              <CardDescription>
                For the period {format(dateRange.from, 'MMMM d, yyyy')} to {format(dateRange.to, 'MMMM d, yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Column Headers */}
              {renderColumnHeaders()}
              
              {/* Revenue */}
              <div className="space-y-2">
                <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <TrendingUp className="h-5 w-5 text-indigo-600" />
                  Revenue
                </h3>
                {Object.entries(ACCOUNT_CATEGORIES.income).map(([category, prefixes]) => (
                  <div key={category}>
                    {renderAccountSection(category, 'income', prefixes, <DollarSign className="h-4 w-4 text-indigo-500" />)}
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 px-3 bg-indigo-500/10 rounded-lg font-bold">
                  <span>Total Revenue</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => (
                      <span key={idx} className="font-mono text-sm text-indigo-600/70 min-w-[90px] text-right">
                        {formatCurrency(getComparisonTypeTotal('income', idx))}
                      </span>
                    ))}
                    <span className="font-mono text-indigo-600 min-w-[100px] text-right">{formatCurrency(totalIncome)}</span>
                  </div>
                </div>
              </div>

              {/* Expenses */}
              <div className="space-y-2">
                <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Expenses
                </h3>
                {Object.entries(ACCOUNT_CATEGORIES.expense).map(([category, prefixes]) => (
                  <div key={category}>
                    {renderAccountSection(category, 'expense', prefixes, <DollarSign className="h-4 w-4 text-red-500" />)}
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 px-3 bg-red-500/10 rounded-lg font-bold">
                  <span>Total Expenses</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => (
                      <span key={idx} className="font-mono text-sm text-red-600/70 min-w-[90px] text-right">
                        {formatCurrency(getComparisonTypeTotal('expense', idx))}
                      </span>
                    ))}
                    <span className="font-mono text-red-600 min-w-[100px] text-right">{formatCurrency(totalExpenses)}</span>
                  </div>
                </div>
              </div>

              {/* Gross Profit */}
              <div className="space-y-2">
                <div className="flex justify-between items-center py-3 px-3 bg-muted rounded-lg">
                  <span className="font-semibold">Gross Profit</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => {
                      const compOpRevenue = getComparisonCategoryTotal('income', ACCOUNT_CATEGORIES.income['Operating Revenue'], idx);
                      const compCOS = getComparisonCategoryTotal('expense', ACCOUNT_CATEGORIES.expense['Cost of Sales'], idx);
                      return (
                        <span key={idx} className="font-mono text-sm text-muted-foreground min-w-[90px] text-right">
                          {formatCurrency(compOpRevenue - compCOS)}
                        </span>
                      );
                    })}
                    <span className="font-mono font-semibold min-w-[100px] text-right">
                      {formatCurrency(getCategoryTotal('income', ACCOUNT_CATEGORIES.income['Operating Revenue']) - getCategoryTotal('expense', ACCOUNT_CATEGORIES.expense['Cost of Sales']))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Income */}
              <div className="pt-4 border-t-2">
                <div className={cn(
                  "flex justify-between items-center py-4 px-4 rounded-lg font-bold text-lg",
                  netIncome >= 0 ? "bg-indigo-500/20" : "bg-red-500/20"
                )}>
                  <span>Net Income</span>
                  <div className="flex items-center gap-4">
                    {compareConfig.enabled && comparisonPeriods.map((_, idx) => {
                      const compIncome = getComparisonTypeTotal('income', idx);
                      const compExpenses = getComparisonTypeTotal('expense', idx);
                      const compNetIncome = compIncome - compExpenses;
                      return (
                        <span key={idx} className={cn("font-mono text-sm min-w-[90px] text-right", compNetIncome >= 0 ? "text-indigo-600/70" : "text-red-600/70")}>
                          {formatCurrency(compNetIncome)}
                        </span>
                      );
                    })}
                    <span className={cn("font-mono min-w-[100px] text-right", netIncome >= 0 ? "text-indigo-600" : "text-red-600")}>
                      {formatCurrency(netIncome)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cash Flow Statement */}
        <TabsContent value="cash-flow">
          <CashFlowContent 
            dateRange={dateRange} 
            expandedSections={expandedSections}
            toggleSection={toggleSection}
            formatCurrency={formatCurrency}
            compareConfig={compareConfig}
            comparisonPeriods={comparisonPeriods}
          />
        </TabsContent>

        {/* Statement of Changes in Equity */}
        <TabsContent value="changes-equity">
          <Card>
            <CardHeader>
              <CardTitle>Statement of Changes in Equity</CardTitle>
              <CardDescription>
                For the period {format(dateRange.from, 'MMMM d, yyyy')} to {format(dateRange.to, 'MMMM d, yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-semibold">Component</th>
                      <th className="text-right py-3 px-2 font-semibold">Opening Balance</th>
                      <th className="text-right py-3 px-2 font-semibold">Additions</th>
                      <th className="text-right py-3 px-2 font-semibold">Deductions</th>
                      <th className="text-right py-3 px-2 font-semibold">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">Share Capital</td>
                      <td className="text-right font-mono">{formatCurrency(0)}</td>
                      <td className="text-right font-mono text-indigo-600">{formatCurrency(0)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(0)}</td>
                      <td className="text-right font-mono font-semibold">{formatCurrency(0)}</td>
                    </tr>
                    <tr className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">Retained Earnings</td>
                      <td className="text-right font-mono">{formatCurrency(totalEquity)}</td>
                      <td className="text-right font-mono text-indigo-600">{formatCurrency(netIncome > 0 ? netIncome : 0)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(netIncome < 0 ? Math.abs(netIncome) : 0)}</td>
                      <td className="text-right font-mono font-semibold">{formatCurrency(totalEquity + netIncome)}</td>
                    </tr>
                    <tr className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">Other Reserves</td>
                      <td className="text-right font-mono">{formatCurrency(0)}</td>
                      <td className="text-right font-mono text-indigo-600">{formatCurrency(0)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(0)}</td>
                      <td className="text-right font-mono font-semibold">{formatCurrency(0)}</td>
                    </tr>
                    <tr className="bg-primary/10 font-bold">
                      <td className="py-3 px-2">Total Equity</td>
                      <td className="text-right font-mono">{formatCurrency(totalEquity)}</td>
                      <td className="text-right font-mono text-indigo-600">{formatCurrency(netIncome > 0 ? netIncome : 0)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(netIncome < 0 ? Math.abs(netIncome) : 0)}</td>
                      <td className="text-right font-mono">{formatCurrency(totalEquity + netIncome)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
