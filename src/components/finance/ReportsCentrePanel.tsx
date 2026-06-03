import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from "date-fns";
import { 
  FileText, 
  Download, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  BarChart3,
  PieChart,
  GitCompare
} from "lucide-react";
import { cn } from "@/lib/utils";

type DateRange = {
  from: Date;
  to: Date;
};

type CompareConfig = {
  enabled: boolean;
  compareType: 'previous_periods' | 'previous_years';
  numberOfPeriods: number;
  arrangeLatestFirst: boolean;
};

export const ReportsCentrePanel = () => {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [reportPeriod, setReportPeriod] = useState("this_month");
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareConfig, setCompareConfig] = useState<CompareConfig>({
    enabled: false,
    compareType: 'previous_periods',
    numberOfPeriods: 1,
    arrangeLatestFirst: false,
  });
  const [tempCompareConfig, setTempCompareConfig] = useState<CompareConfig>(compareConfig);

  const handlePeriodChange = (period: string) => {
    setReportPeriod(period);
    const today = new Date();
    switch (period) {
      case "today":
        setDateRange({ from: today, to: today });
        break;
      case "last_7_days":
        setDateRange({ from: subDays(today, 7), to: today });
        break;
      case "this_month":
        setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
        break;
      case "last_month":
        const lastMonth = subMonths(today, 1);
        setDateRange({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
        break;
      case "last_3_months":
        setDateRange({ from: subMonths(today, 3), to: today });
        break;
      case "this_year":
        setDateRange({ from: startOfYear(today), to: endOfYear(today) });
        break;
      case "last_year":
        const lastYear = subYears(today, 1);
        setDateRange({ from: startOfYear(lastYear), to: endOfYear(lastYear) });
        break;
      case "custom":
        // Keep current range, user will select via calendar
        break;
    }
  };

  const handleApplyCompare = () => {
    setCompareConfig(tempCompareConfig);
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

  // Fetch summary data
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['reports-summary', dateRange],
    queryFn: async () => {
      const [transfers, invoices, bills, fxTrades] = await Promise.all([
        supabase.from('transfers')
          .select('source_amount, fee_amount, status')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString()),
        supabase.from('sales_invoices')
          .select('total_amount, amount_paid, status')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString()),
        supabase.from('purchase_bills')
          .select('total_amount, amount_paid, status')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString()),
        supabase.from('fx_transactions')
          .select('from_amount, to_amount, fee_amount, status')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString()),
      ]);

      const totalTransfers = transfers.data?.reduce((sum, t) => sum + (t.source_amount || 0), 0) || 0;
      const totalFees = (transfers.data?.reduce((sum, t) => sum + (t.fee_amount || 0), 0) || 0) +
                        (fxTrades.data?.reduce((sum, t) => sum + (t.fee_amount || 0), 0) || 0);
      const totalInvoiced = invoices.data?.reduce((sum, i) => sum + (i.total_amount || 0), 0) || 0;
      const totalReceived = invoices.data?.reduce((sum, i) => sum + (i.amount_paid || 0), 0) || 0;
      const totalBilled = bills.data?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;
      const totalPaid = bills.data?.reduce((sum, b) => sum + (b.amount_paid || 0), 0) || 0;
      const fxVolume = fxTrades.data?.reduce((sum, t) => sum + (t.from_amount || 0), 0) || 0;

      return {
        totalTransfers,
        totalFees,
        totalInvoiced,
        totalReceived,
        totalBilled,
        totalPaid,
        fxVolume,
        transferCount: transfers.data?.length || 0,
        invoiceCount: invoices.data?.length || 0,
        billCount: bills.data?.length || 0,
        fxCount: fxTrades.data?.length || 0,
      };
    },
  });

  // Fetch aging report data
  const { data: agingData, isLoading: agingLoading } = useQuery({
    queryKey: ['aging-report'],
    queryFn: async () => {
      const today = new Date();
      const [invoices, bills] = await Promise.all([
        supabase.from('sales_invoices')
          .select('*, customers(name)')
          .in('status', ['sent', 'partial', 'overdue']),
        supabase.from('purchase_bills')
          .select('*, vendors(name)')
          .in('status', ['sent', 'partial', 'overdue']),
      ]);

      const categorizeAge = (dueDate: string) => {
        const due = new Date(dueDate);
        const daysDiff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) return 'current';
        if (daysDiff <= 30) return '1-30';
        if (daysDiff <= 60) return '31-60';
        if (daysDiff <= 90) return '61-90';
        return '90+';
      };

      const receivables = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
      const payables = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };

      invoices.data?.forEach(inv => {
        const outstanding = (inv.total_amount || 0) - (inv.amount_paid || 0);
        const age = categorizeAge(inv.due_date);
        receivables[age as keyof typeof receivables] += outstanding;
      });

      bills.data?.forEach(bill => {
        const outstanding = (bill.total_amount || 0) - (bill.amount_paid || 0);
        const age = categorizeAge(bill.due_date);
        payables[age as keyof typeof payables] += outstanding;
      });

      return { receivables, payables, invoices: invoices.data || [], bills: bills.data || [] };
    },
  });

  // Fetch P&L data
  const { data: plData, isLoading: plLoading } = useQuery({
    queryKey: ['pl-report', dateRange],
    queryFn: async () => {
      const { data: entries } = await supabase
        .from('ledger_entries')
        .select('*, ledger_accounts(name, account_type)')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      const income: Record<string, number> = {};
      const expenses: Record<string, number> = {};

      entries?.forEach(entry => {
        const accountName = entry.ledger_accounts?.name || 'Unknown';
        const accountType = entry.ledger_accounts?.account_type;
        const netAmount = (entry.credit_amount || 0) - (entry.debit_amount || 0);

        if (accountType === 'income') {
          income[accountName] = (income[accountName] || 0) + netAmount;
        } else if (accountType === 'expense') {
          expenses[accountName] = (expenses[accountName] || 0) + Math.abs(netAmount);
        }
      });

      const totalIncome = Object.values(income).reduce((sum, val) => sum + val, 0);
      const totalExpenses = Object.values(expenses).reduce((sum, val) => sum + val, 0);

      return { income, expenses, totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses };
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const reportTypes = [
    { id: 'income_statement', name: 'Income Statement', icon: BarChart3, description: 'Revenue, expenses, and net income' },
    { id: 'balance_sheet', name: 'Balance Sheet', icon: PieChart, description: 'Assets, liabilities, and equity' },
    { id: 'cash_flow', name: 'Cash Flow Statement', icon: TrendingUp, description: 'Operating, investing, financing activities' },
    { id: 'trial_balance', name: 'Trial Balance', icon: FileSpreadsheet, description: 'Debit and credit balances' },
    { id: 'ar_aging', name: 'AR Aging Report', icon: ArrowUpRight, description: 'Outstanding receivables by age' },
    { id: 'ap_aging', name: 'AP Aging Report', icon: ArrowDownRight, description: 'Outstanding payables by age' },
    { id: 'transaction_summary', name: 'Transaction Summary', icon: CreditCard, description: 'Transfer and FX activity' },
    { id: 'fee_income', name: 'Fee Income Report', icon: DollarSign, description: 'Fee revenue breakdown' },
  ];

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Reports Centre
              </CardTitle>
              <CardDescription>Generate and export financial reports</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={reportPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="last_year">Last Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-auto justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
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
                    className="gap-2"
                    onClick={() => setTempCompareConfig(compareConfig)}
                  >
                    <GitCompare className="h-4 w-4" />
                    Compare With
                    {compareConfig.enabled && (
                      <Badge variant="secondary" className="ml-1">
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
                          setTempCompareConfig(prev => ({ ...prev, compareType: value, enabled: true }))
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
                          setTempCompareConfig(prev => ({ ...prev, numberOfPeriods: parseInt(value), enabled: true }))
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
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryLoading ? (
          Array(4).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Transfers</p>
                    <p className="text-2xl font-bold">{formatCurrency(summaryData?.totalTransfers || 0)}</p>
                    <p className="text-xs text-muted-foreground">{summaryData?.transferCount} transactions</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Fee Income</p>
                    <p className="text-2xl font-bold text-indigo-600">{formatCurrency(summaryData?.totalFees || 0)}</p>
                    <p className="text-xs text-muted-foreground">Transfer & FX fees</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-indigo-500/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-indigo-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Receivables</p>
                    <p className="text-2xl font-bold">{formatCurrency(summaryData?.totalInvoiced || 0)}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(summaryData?.totalReceived || 0)} collected</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <ArrowUpRight className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Payables</p>
                    <p className="text-2xl font-bold">{formatCurrency(summaryData?.totalBilled || 0)}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(summaryData?.totalPaid || 0)} paid</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <ArrowDownRight className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Report Tabs */}
      <Tabs defaultValue="quick_reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="quick_reports">Quick Reports</TabsTrigger>
          <TabsTrigger value="aging">Aging Reports</TabsTrigger>
          <TabsTrigger value="pl">Profit & Loss</TabsTrigger>
        </TabsList>

        <TabsContent value="quick_reports">
          <Card>
            <CardHeader>
              <CardTitle>Available Reports</CardTitle>
              <CardDescription>Select a report to generate and download</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {reportTypes.map((report) => (
                  <Card key={report.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardContent className="pt-6">
                      <div className="flex flex-col items-center text-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <report.icon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{report.name}</p>
                          <p className="text-xs text-muted-foreground">{report.description}</p>
                        </div>
                        <Button size="sm" variant="outline" className="w-full">
                          <Download className="h-4 w-4 mr-2" />
                          Generate
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpRight className="h-5 w-5 text-blue-600" />
                  Accounts Receivable Aging
                </CardTitle>
                <CardDescription>Outstanding customer invoices by age</CardDescription>
              </CardHeader>
              <CardContent>
                {agingLoading ? (
                  <Skeleton className="h-40" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Age Bracket</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(agingData?.receivables || {}).map(([age, amount]) => (
                        <TableRow key={age}>
                          <TableCell>
                            <Badge variant={age === '90+' ? 'destructive' : age === 'current' ? 'default' : 'secondary'}>
                              {age === 'current' ? 'Current' : `${age} days`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Object.values(agingData?.receivables || {}).reduce((sum, val) => sum + val, 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownRight className="h-5 w-5 text-orange-600" />
                  Accounts Payable Aging
                </CardTitle>
                <CardDescription>Outstanding vendor bills by age</CardDescription>
              </CardHeader>
              <CardContent>
                {agingLoading ? (
                  <Skeleton className="h-40" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Age Bracket</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(agingData?.payables || {}).map(([age, amount]) => (
                        <TableRow key={age}>
                          <TableCell>
                            <Badge variant={age === '90+' ? 'destructive' : age === 'current' ? 'default' : 'secondary'}>
                              {age === 'current' ? 'Current' : `${age} days`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Object.values(agingData?.payables || {}).reduce((sum, val) => sum + val, 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pl">
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Summary</CardTitle>
              <CardDescription>
                {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plLoading ? (
                <Skeleton className="h-60" />
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-indigo-600" />
                      Income
                    </h4>
                    <Table>
                      <TableBody>
                        {Object.entries(plData?.income || {}).map(([account, amount]) => (
                          <TableRow key={account}>
                            <TableCell>{account}</TableCell>
                            <TableCell className="text-right text-indigo-600">{formatCurrency(amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold border-t-2">
                          <TableCell>Total Income</TableCell>
                          <TableCell className="text-right text-indigo-600">{formatCurrency(plData?.totalIncome || 0)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      Expenses
                    </h4>
                    <Table>
                      <TableBody>
                        {Object.entries(plData?.expenses || {}).map(([account, amount]) => (
                          <TableRow key={account}>
                            <TableCell>{account}</TableCell>
                            <TableCell className="text-right text-red-600">{formatCurrency(amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold border-t-2">
                          <TableCell>Total Expenses</TableCell>
                          <TableCell className="text-right text-red-600">{formatCurrency(plData?.totalExpenses || 0)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div className="lg:col-span-2">
                    <Card className={cn(
                      "border-2",
                      (plData?.netIncome || 0) >= 0 ? "border-indigo-500/20 bg-indigo-500/5" : "border-red-500/20 bg-red-500/5"
                    )}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-semibold">Net Income</span>
                          <span className={cn(
                            "text-2xl font-bold",
                            (plData?.netIncome || 0) >= 0 ? "text-indigo-600" : "text-red-600"
                          )}>
                            {formatCurrency(plData?.netIncome || 0)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
