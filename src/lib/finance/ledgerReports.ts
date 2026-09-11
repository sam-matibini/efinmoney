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

export async function loadLedgerPeriod(from: Date, to: Date) {
  const [{ data: accounts, error: accountsError }, { data: entries, error: entriesError }] = await Promise.all([
    supabase.from("ledger_accounts").select("id, code, name, account_type").eq("is_active", true).order("code"),
    supabase
      .from("ledger_entries")
      .select("account_id, debit_amount, credit_amount, currency_code, created_at, description, reference_type")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString()),
  ]);
  if (accountsError) throw accountsError;
  if (entriesError) throw entriesError;
  return {
    accounts: (accounts ?? []) as LedgerAccountRow[],
    entries: (entries ?? []) as LedgerEntryRow[],
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
    ...sections,
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
  const { accounts, entries } = await loadLedgerPeriod(from, to);
  const period = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;

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

  throw new Error("Unsupported report");
}

export function downloadGeneratedReport(filename: string, header: string[], rows: Array<Array<unknown>>) {
  downloadCsv(filename, header, rows);
}
