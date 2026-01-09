import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, startOfQuarter, endOfQuarter, subQuarters } from "date-fns";
import { ChevronDown, ChevronRight, Calendar as CalendarIcon, Download, FileText, TrendingUp, TrendingDown, DollarSign, Wallet, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [comparisonPeriod, setComparisonPeriod] = useState<'none' | 'previous_period' | 'previous_year'>('none');

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

  const { data: accountBalances = [], isLoading } = useQuery({
    queryKey: ['financial-statements', dateRange],
    queryFn: async () => {
      const { data: accounts, error: accountsError } = await supabase
        .from('ledger_accounts')
        .select('id, code, name, account_type, parent_id')
        .eq('is_active', true)
        .order('code');

      if (accountsError) throw accountsError;

      const { data: entries, error: entriesError } = await supabase
        .from('ledger_entries')
        .select('account_id, debit_amount, credit_amount, created_at')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

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
    },
  });

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

  const renderAccountSection = (
    title: string,
    type: string,
    prefixes: string[],
    icon: React.ReactNode
  ) => {
    const accounts = getAccountsByCategory(type, prefixes);
    const total = getCategoryTotal(type, prefixes);
    const isExpanded = expandedSections.has(title);

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
            <span className="font-mono font-semibold">{formatCurrency(total)}</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-6 mt-1 space-y-1">
            {accounts.length === 0 ? (
              <p className="text-muted-foreground text-sm py-2 pl-4">No entries in this category</p>
            ) : (
              accounts.map(account => (
                <div 
                  key={account.code} 
                  className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted hover:bg-muted/30 transition-colors"
                >
                  <span className="text-sm">
                    <span className="text-muted-foreground font-mono mr-2">{account.code}</span>
                    {account.name}
                  </span>
                  <span className="font-mono text-sm">
                    {formatCurrency(type === 'liability' || type === 'income' ? Math.abs(account.balance) : account.balance)}
                  </span>
                </div>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
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

              <Select value={comparisonPeriod} onValueChange={(v: any) => setComparisonPeriod(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Compare" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Comparison</SelectItem>
                  <SelectItem value="previous_period">vs Prior Period</SelectItem>
                  <SelectItem value="previous_year">vs Prior Year</SelectItem>
                </SelectContent>
              </Select>
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
                  <span className="font-mono">{formatCurrency(totalAssets)}</span>
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
                  <span className="font-mono">{formatCurrency(totalLiabilities)}</span>
                </div>
              </div>

              {/* Equity */}
              <div className="space-y-2">
                <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Equity
                </h3>
                {renderAccountSection('Equity', 'equity', ACCOUNT_CATEGORIES.equity.Equity, <DollarSign className="h-4 w-4 text-green-500" />)}
                <div className="flex justify-between items-center py-2 px-3 border-l-2 border-muted">
                  <span className="text-sm italic">Retained Earnings (Net Income)</span>
                  <span className={cn("font-mono text-sm", netIncome >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatCurrency(netIncome)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 px-3 bg-green-500/10 rounded-lg font-bold">
                  <span>Total Equity</span>
                  <span className="font-mono">{formatCurrency(totalEquity + netIncome)}</span>
                </div>
              </div>

              {/* Balance Check */}
              <div className="pt-4 border-t-2">
                <div className="flex justify-between items-center py-3 px-3 bg-primary/10 rounded-lg font-bold text-lg">
                  <span>Total Liabilities & Equity</span>
                  <span className="font-mono">{formatCurrency(totalLiabilities + totalEquity + netIncome)}</span>
                </div>
                {Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) > 0.01 && (
                  <p className="text-xs text-destructive mt-2">
                    ⚠️ Balance sheet does not balance. Difference: {formatCurrency(totalAssets - (totalLiabilities + totalEquity + netIncome))}
                  </p>
                )}
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
              {/* Revenue */}
              <div className="space-y-2">
                <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Revenue
                </h3>
                {Object.entries(ACCOUNT_CATEGORIES.income).map(([category, prefixes]) => (
                  <div key={category}>
                    {renderAccountSection(category, 'income', prefixes, <DollarSign className="h-4 w-4 text-green-500" />)}
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 px-3 bg-green-500/10 rounded-lg font-bold">
                  <span>Total Revenue</span>
                  <span className="font-mono text-green-600">{formatCurrency(totalIncome)}</span>
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
                  <span className="font-mono text-red-600">{formatCurrency(totalExpenses)}</span>
                </div>
              </div>

              {/* Gross Profit */}
              <div className="space-y-2">
                <div className="flex justify-between items-center py-3 px-3 bg-muted rounded-lg">
                  <span className="font-semibold">Gross Profit</span>
                  <span className="font-mono font-semibold">
                    {formatCurrency(getCategoryTotal('income', ACCOUNT_CATEGORIES.income['Operating Revenue']) - getCategoryTotal('expense', ACCOUNT_CATEGORIES.expense['Cost of Sales']))}
                  </span>
                </div>
              </div>

              {/* Net Income */}
              <div className="pt-4 border-t-2">
                <div className={cn(
                  "flex justify-between items-center py-4 px-4 rounded-lg font-bold text-lg",
                  netIncome >= 0 ? "bg-green-500/20" : "bg-red-500/20"
                )}>
                  <span>Net Income</span>
                  <span className={cn("font-mono", netIncome >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatCurrency(netIncome)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cash Flow Statement */}
        <TabsContent value="cash-flow">
          <Card>
            <CardHeader>
              <CardTitle>Statement of Cash Flows</CardTitle>
              <CardDescription>
                For the period {format(dateRange.from, 'MMMM d, yyyy')} to {format(dateRange.to, 'MMMM d, yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Operating Activities */}
              <Collapsible open={expandedSections.has('Operating Activities')} onOpenChange={() => toggleSection('Operating Activities')}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between py-2 px-3 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition-colors">
                    <div className="flex items-center gap-2">
                      {expandedSections.has('Operating Activities') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-semibold">Cash Flows from Operating Activities</span>
                    </div>
                    <span className="font-mono font-semibold">{formatCurrency(netIncome)}</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-6 mt-2 space-y-2">
                    <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted">
                      <span className="text-sm">Net Income</span>
                      <span className="font-mono text-sm">{formatCurrency(netIncome)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted text-muted-foreground">
                      <span className="text-sm italic">Adjustments for non-cash items</span>
                      <span className="font-mono text-sm">-</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted text-muted-foreground">
                      <span className="text-sm italic">Changes in working capital</span>
                      <span className="font-mono text-sm">-</span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Investing Activities */}
              <Collapsible open={expandedSections.has('Investing Activities')} onOpenChange={() => toggleSection('Investing Activities')}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between py-2 px-3 bg-purple-500/10 rounded-lg hover:bg-purple-500/20 transition-colors">
                    <div className="flex items-center gap-2">
                      {expandedSections.has('Investing Activities') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-semibold">Cash Flows from Investing Activities</span>
                    </div>
                    <span className="font-mono font-semibold text-muted-foreground">$0.00</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-6 mt-2 space-y-2">
                    <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted text-muted-foreground">
                      <span className="text-sm italic">Purchase of fixed assets</span>
                      <span className="font-mono text-sm">-</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted text-muted-foreground">
                      <span className="text-sm italic">Sale of investments</span>
                      <span className="font-mono text-sm">-</span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Financing Activities */}
              <Collapsible open={expandedSections.has('Financing Activities')} onOpenChange={() => toggleSection('Financing Activities')}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between py-2 px-3 bg-orange-500/10 rounded-lg hover:bg-orange-500/20 transition-colors">
                    <div className="flex items-center gap-2">
                      {expandedSections.has('Financing Activities') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-semibold">Cash Flows from Financing Activities</span>
                    </div>
                    <span className="font-mono font-semibold text-muted-foreground">$0.00</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-6 mt-2 space-y-2">
                    <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted text-muted-foreground">
                      <span className="text-sm italic">Proceeds from borrowings</span>
                      <span className="font-mono text-sm">-</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 px-3 border-l-2 border-muted text-muted-foreground">
                      <span className="text-sm italic">Dividends paid</span>
                      <span className="font-mono text-sm">-</span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Net Change */}
              <div className="pt-4 border-t-2">
                <div className={cn(
                  "flex justify-between items-center py-4 px-4 rounded-lg font-bold text-lg",
                  netIncome >= 0 ? "bg-green-500/20" : "bg-red-500/20"
                )}>
                  <span>Net Change in Cash</span>
                  <span className={cn("font-mono", netIncome >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatCurrency(netIncome)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
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
                      <td className="text-right font-mono text-green-600">{formatCurrency(0)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(0)}</td>
                      <td className="text-right font-mono font-semibold">{formatCurrency(0)}</td>
                    </tr>
                    <tr className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">Retained Earnings</td>
                      <td className="text-right font-mono">{formatCurrency(totalEquity)}</td>
                      <td className="text-right font-mono text-green-600">{formatCurrency(netIncome > 0 ? netIncome : 0)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(netIncome < 0 ? Math.abs(netIncome) : 0)}</td>
                      <td className="text-right font-mono font-semibold">{formatCurrency(totalEquity + netIncome)}</td>
                    </tr>
                    <tr className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">Other Reserves</td>
                      <td className="text-right font-mono">{formatCurrency(0)}</td>
                      <td className="text-right font-mono text-green-600">{formatCurrency(0)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(0)}</td>
                      <td className="text-right font-mono font-semibold">{formatCurrency(0)}</td>
                    </tr>
                    <tr className="bg-primary/10 font-bold">
                      <td className="py-3 px-2">Total Equity</td>
                      <td className="text-right font-mono">{formatCurrency(totalEquity)}</td>
                      <td className="text-right font-mono text-green-600">{formatCurrency(netIncome > 0 ? netIncome : 0)}</td>
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
