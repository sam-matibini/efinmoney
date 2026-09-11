import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/components/admin-portal/TableControls";

export type LedgerAccountRow = {
  id: string;
  code: string;
  name: string;
  account_type: string;
};

export type LedgerEntryRow = {
  account_id: string;
  debit_amount: number | null;
  credit_amount: number | null;
  currency_code: string | null;
  created_at?: string;
  description?: string | null;
  reference_type?: string | null;
};

const FEE_CODES = new Set(["4100", "4200", "4300"]);
const PAGE_SIZE = 1000;
const OPEN_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;

export type AgeBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export type AgingTotals = Record<AgeBucket, number>;

const EMPTY_AGING: AgingTotals = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

/** Operational tables can 400 / RLS-fail; never take the Reports Centre down with them. */
export async function safeTableRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn("[ReportsCentre]", error.message);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.warn("[ReportsCentre]", error);
    return [];
  }
}

export async function loadLedgerPeriod(from: Date, to: Date) {
  const { data: accounts, error: accountsError } = await supabase
    .from("ledger_accounts")
    .select("id, code, name, account_type")
    .order("code");
  if (accountsError) throw accountsError;

  const entries: LedgerEntryRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("account_id, debit_amount, credit_amount, currency_code, created_at, description, reference_type")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    entries.push(...(data as LedgerEntryRow[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return {
    accounts: (accounts ?? []) as LedgerAccountRow[],
    entries,
  };
}

export function categorizeAge(dueDate: string | null | undefined, today = new Date()): AgeBucket {
  if (!dueDate) return "current";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "current";
  const daysDiff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 0) return "current";
  if (daysDiff <= 30) return "1-30";
  if (daysDiff <= 60) return "31-60";
  if (daysDiff <= 90) return "61-90";
  return "90+";
}

export function ageOutstanding(
  rows: Array<{ due_date?: string | null; total_amount?: number | null; amount_paid?: number | null }>,
): AgingTotals {
  const buckets: AgingTotals = { ...EMPTY_AGING };
  for (const row of rows) {
    const outstanding = Number(row.total_amount || 0) - Number(row.amount_paid || 0);
    if (outstanding <= 0) continue;
    buckets[categorizeAge(row.due_date)] += outstanding;
  }
  return buckets;
}

export async function loadAgingReport() {
  const [invoices, bills] = await Promise.all([
    safeTableRows(
      supabase
        .from("sales_invoices")
        .select("due_date, total_amount, amount_paid, invoice_number, status")
        .in("status", [...OPEN_INVOICE_STATUSES]),
    ),
    safeTableRows(
      supabase
        .from("purchase_bills")
        .select("due_date, total_amount, amount_paid, bill_number, status")
        .in("status", [...OPEN_INVOICE_STATUSES]),
    ),
  ]);
  return {
    invoices,
    bills,
    receivables: ageOutstanding(invoices),
    payables: ageOutstanding(bills),
  };
}

export function cashFlowFromLedger(accounts: LedgerAccountRow[], entries: LedgerEntryRow[]) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  let operatingInflows = 0;
  let operatingOutflows = 0;
  let investingInflows = 0;
  let investingOutflows = 0;
  let financingInflows = 0;
  let financingOutflows = 0;

  for (const entry of entries) {
    const account = byId.get(entry.account_id);
    if (!account) continue;
    const netFlow = netCredit(entry);
    const refType = entry.reference_type || "";

    if (account.code.startsWith("11") || account.code.startsWith("12")) {
      if (refType === "transfer" || refType === "fx") {
        if (netFlow > 0) operatingInflows += netFlow;
        else operatingOutflows += Math.abs(netFlow);
      }
    } else if (account.code.startsWith("14") || account.code.startsWith("15")) {
      if (netFlow > 0) investingInflows += netFlow;
      else investingOutflows += Math.abs(netFlow);
    } else if (account.code.startsWith("21") || account.code.startsWith("22")) {
      if (netFlow > 0) financingInflows += netFlow;
      else financingOutflows += Math.abs(netFlow);
    } else if (account.account_type === "income") {
      operatingInflows += Math.abs(netFlow);
    } else if (account.account_type === "expense") {
      operatingOutflows += Math.abs(netFlow);
    }
  }

  const operatingNet = operatingInflows - operatingOutflows;
  const investingNet = investingInflows - investingOutflows;
  const financingNet = financingInflows - financingOutflows;
  return {
    operating: { inflows: operatingInflows, outflows: operatingOutflows, net: operatingNet },
    investing: { inflows: investingInflows, outflows: investingOutflows, net: investingNet },
    financing: { inflows: financingInflows, outflows: financingOutflows, net: financingNet },
    netChange: operatingNet + investingNet + financingNet,
  };
}

function netCredit(entry: LedgerEntryRow) {
  return Number(entry.credit_amount || 0) - Number(entry.debit_amount || 0);
}

export function trialBalanceFromLedger(accounts: LedgerAccountRow[], entries: LedgerEntryRow[]) {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const entry of entries) {
    const current = totals.get(entry.account_id) || { debit: 0, credit: 0 };
    totals.set(entry.account_id, {
      debit: current.debit + Number(entry.debit_amount || 0),
      credit: current.credit + Number(entry.credit_amount || 0),
    });
  }
  return accounts
    .map((account) => {
      const row = totals.get(account.id) || { debit: 0, credit: 0 };
      return {
        code: account.code,
        name: account.name,
        account_type: account.account_type,
        debit: row.debit,
        credit: row.credit,
      };
    })
    .filter((row) => row.debit > 0 || row.credit > 0);
}

export function feeIncomeFromLedger(accounts: LedgerAccountRow[], entries: LedgerEntryRow[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byName: Record<string, number> = {};
  let total = 0;
  for (const entry of entries) {
    const account = byId.get(entry.account_id);
    if (!account) continue;
    const isFee = FEE_CODES.has(account.code) || (account.account_type === "income" && /fee|spread|fx gain/i.test(account.name));
    if (!isFee) continue;
    const amount = netCredit(entry);
    byName[account.name] = (byName[account.name] || 0) + amount;
    total += amount;
  }
  return { total, byName };
}

export function incomeStatementFromLedger(accounts: LedgerAccountRow[], entries: LedgerEntryRow[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const income: Record<string, number> = {};
  const expenses: Record<string, number> = {};
  for (const entry of entries) {
    const account = byId.get(entry.account_id);
    if (!account) continue;
    const amount = netCredit(entry);
    if (account.account_type === "income") income[account.name] = (income[account.name] || 0) + amount;
    if (account.account_type === "expense") expenses[account.name] = (expenses[account.name] || 0) + Math.abs(amount);
  }
  const totalIncome = Object.values(income).reduce((sum, n) => sum + n, 0);
  const totalExpenses = Object.values(expenses).reduce((sum, n) => sum + n, 0);
  return { income, expenses, totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses };
}

export function balanceSheetFromLedger(accounts: LedgerAccountRow[], entries: LedgerEntryRow[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const sections: Record<string, Record<string, number>> = {
    asset: {},
    liability: {},
    equity: {},
  };
  for (const entry of entries) {
    const account = byId.get(entry.account_id);
    if (!account || !(account.account_type in sections)) continue;
    const signed =
      account.account_type === "asset"
        ? Number(entry.debit_amount || 0) - Number(entry.credit_amount || 0)
        : Number(entry.credit_amount || 0) - Number(entry.debit_amount || 0);
    sections[account.account_type][`${account.code} ${account.name}`] =
      (sections[account.account_type][`${account.code} ${account.name}`] || 0) + signed;
  }
  const total = (type: string) => Object.values(sections[type] || {}).reduce((sum, n) => sum + n, 0);
  return {
    asset: sections.asset,
    liability: sections.liability,
    equity: sections.equity,
    totalAssets: total("asset"),
    totalLiabilities: total("liability"),
    totalEquity: total("equity"),
  };
}

function rowsFromRecord(record: Record<string, number>) {
  return Object.entries(record).map(([name, amount]) => [name, Number(amount.toFixed(2))]);
}

export async function generateLedgerReport(
  reportId: string,
  from: Date,
  to: Date,
): Promise<{ filename: string; header: string[]; rows: Array<Array<unknown>> }> {
  const period = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;

  if (reportId === "ar_aging" || reportId === "ap_aging") {
    const aging = await loadAgingReport();
    const totals = reportId === "ar_aging" ? aging.receivables : aging.payables;
    return {
      filename: `${reportId}-${period}`,
      header: ["Age bracket", "Amount"],
      rows: [
        ...Object.entries(totals).map(([bucket, amount]) => [bucket, Number(amount.toFixed(2))]),
        ["Total", Number(Object.values(totals).reduce((sum, n) => sum + n, 0).toFixed(2))],
      ],
    };
  }

  const { accounts, entries } = await loadLedgerPeriod(from, to);

  if (reportId === "fee_income") {
    const fees = feeIncomeFromLedger(accounts, entries);
    return {
      filename: `fee-income-${period}`,
      header: ["Account", "Amount"],
      rows: [...rowsFromRecord(fees.byName), ["Total fee income", Number(fees.total.toFixed(2))]],
    };
  }

  if (reportId === "trial_balance") {
    const tb = trialBalanceFromLedger(accounts, entries);
    return {
      filename: `trial-balance-${period}`,
      header: ["Code", "Account", "Type", "Debit", "Credit"],
      rows: tb.map((row) => [row.code, row.name, row.account_type, Number(row.debit.toFixed(2)), Number(row.credit.toFixed(2))]),
    };
  }

  if (reportId === "income_statement") {
    const pl = incomeStatementFromLedger(accounts, entries);
    return {
      filename: `income-statement-${period}`,
      header: ["Section", "Account", "Amount"],
      rows: [
        ...Object.entries(pl.income).map(([name, amount]) => ["Income", name, Number(amount.toFixed(2))]),
        ...Object.entries(pl.expenses).map(([name, amount]) => ["Expense", name, Number(amount.toFixed(2))]),
        ["Total", "Net income", Number(pl.netIncome.toFixed(2))],
      ],
    };
  }

  if (reportId === "balance_sheet") {
    const bs = balanceSheetFromLedger(accounts, entries);
    return {
      filename: `balance-sheet-${period}`,
      header: ["Section", "Account", "Amount"],
      rows: [
        ...Object.entries(bs.asset).map(([name, amount]) => ["Asset", name, Number(amount.toFixed(2))]),
        ...Object.entries(bs.liability).map(([name, amount]) => ["Liability", name, Number(amount.toFixed(2))]),
        ...Object.entries(bs.equity).map(([name, amount]) => ["Equity", name, Number(amount.toFixed(2))]),
        ["Total", "Assets", Number(bs.totalAssets.toFixed(2))],
        ["Total", "Liabilities", Number(bs.totalLiabilities.toFixed(2))],
        ["Total", "Equity", Number(bs.totalEquity.toFixed(2))],
      ],
    };
  }

  if (reportId === "cash_flow") {
    const cf = cashFlowFromLedger(accounts, entries);
    return {
      filename: `cash-flow-${period}`,
      header: ["Section", "Metric", "Amount"],
      rows: [
        ["Operating", "Inflows", Number(cf.operating.inflows.toFixed(2))],
        ["Operating", "Outflows", Number(cf.operating.outflows.toFixed(2))],
        ["Operating", "Net", Number(cf.operating.net.toFixed(2))],
        ["Investing", "Inflows", Number(cf.investing.inflows.toFixed(2))],
        ["Investing", "Outflows", Number(cf.investing.outflows.toFixed(2))],
        ["Investing", "Net", Number(cf.investing.net.toFixed(2))],
        ["Financing", "Inflows", Number(cf.financing.inflows.toFixed(2))],
        ["Financing", "Outflows", Number(cf.financing.outflows.toFixed(2))],
        ["Financing", "Net", Number(cf.financing.net.toFixed(2))],
        ["Total", "Net change in cash", Number(cf.netChange.toFixed(2))],
      ],
    };
  }

  throw new Error("Unsupported report");
}

export function downloadGeneratedReport(filename: string, header: string[], rows: Array<Array<unknown>>) {
  downloadCsv(filename, header, rows);
}
