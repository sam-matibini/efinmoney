import { useEffect, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Download, Package, AlertTriangle } from "lucide-react";

// Full list of public.* tables (kept in sync with DATABASE_SCHEMA.sql)
const TABLES: string[] = [
  "admin_notifications","admin_users","aml_matches","aml_screenings","aml_watchlist",
  "audit_logs","bank_accounts","bank_transactions","beneficiaries","bill_payments",
  "business_card_members","business_card_programs","card_authorizations","card_fraud_signals",
  "card_funding_events","card_spending_controls","card_transactions","cardholders","cards",
  "circle_webhook_events","compliance_alerts","compliance_reports","compliance_rules",
  "cpn_corridors","crm_activities","crossmint_wallets","crossmint_yellowcard_transfers",
  "crypto_pairs","crypto_trades","currencies","customer_communications","customer_documents",
  "customer_onboarding","customer_portal_access","customers","disputes","flw_banks_cache",
  "flw_billers_cache","flw_webhook_logs","fx_rates","fx_transactions","input_tax_credits",
  "integration_settings","interac_sessions","intra_ca_transfers","issued_cards","kyc_audit_log",
  "kyc_verifications","ledger_accounts","ledger_entries","linked_funding_sources",
  "maker_checker_requests","notifications","onboarding_steps","operations_kpis",
  "paysafe_webhook_logs","persona_webhook_logs","plaid_accounts","plaid_items","pricing_config",
  "profiles","purchase_bill_items","purchase_bills","rate_limits","reconciliation_records",
  "regulatory_reports","sales_invoice_items","sales_invoices","saved_payment_methods",
  "savings_goals","short_links","stripe_connected_accounts","stripe_payin_sessions",
  "stripe_payout_recipients","sumsub_verifications","sumsub_webhook_logs","tax_filings",
  "tax_rates","tax_registrations","tax_transactions","taxable_services","tier_limits",
  "transaction_interventions","transaction_rules","transfers","treasury_financial_accounts",
  "treasury_received_entries","treasury_transfers","treasury_webhook_events","user_risk_tiers",
  "user_roles","vendors","virtual_accounts","wallet_operations","wallets","webhook_events",
  "webhooks_inbox",
];

function toCSV(rows: any[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}

async function fetchTable(table: string): Promise<any[]> {
  const all: any[] = [];
  const page = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select("*")
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return all;
}

function download(filename: string, content: string | Blob) {
  const blob = typeof content === "string" ? new Blob([content], { type: "text/csv" }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function DataExportPage() {
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => { document.title = "Data Export | Admin"; }, []);

  const visible = TABLES.filter((t) => t.includes(filter.toLowerCase().trim()));

  const exportOne = async (table: string) => {
    try {
      setBusy(table);
      const rows = await fetchTable(table);
      download(`${table}.csv`, toCSV(rows));
      toast({ title: `Exported ${table}`, description: `${rows.length} rows` });
    } catch (e: any) {
      toast({ title: `Failed: ${table}`, description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async () => {
    const zip = new JSZip();
    setBulkProgress({ done: 0, total: TABLES.length });
    const errors: string[] = [];
    for (let i = 0; i < TABLES.length; i++) {
      const t = TABLES[i];
      try {
        const rows = await fetchTable(t);
        zip.file(`${t}.csv`, toCSV(rows));
      } catch (e: any) {
        errors.push(`${t}: ${e.message}`);
        zip.file(`${t}.ERROR.txt`, e.message);
      }
      setBulkProgress({ done: i + 1, total: TABLES.length });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    download(`efinmoney-export-${new Date().toISOString().slice(0,10)}.zip`, blob);
    setBulkProgress(null);
    toast({
      title: "Bulk export complete",
      description: errors.length ? `${errors.length} tables failed (see ERROR files in zip)` : "All tables exported",
      variant: errors.length ? "destructive" : "default",
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Data Export</h1>
        <p className="text-muted-foreground mt-2">
          Download every row of every table as CSV. Exports respect RLS — run while signed in
          as a user with the access you need (super_admin recommended).
        </p>
      </div>

      <Card className="p-4 border-yellow-500/40 bg-yellow-500/5 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          This page exports <strong>row data only</strong>. The schema lives in{" "}
          <code>DATABASE_SCHEMA.sql</code>; storage bucket files and a full <code>pg_dump</code> are
          not available on Lovable Cloud — contact Lovable support for those. See{" "}
          <code>MIGRATION.md</code> for the full migration playbook.
        </div>
      </Card>

      <div className="flex gap-3 items-center">
        <Input
          placeholder="Filter tables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={exportAll} disabled={bulkProgress !== null}>
          <Package className="w-4 h-4 mr-2" />
          {bulkProgress
            ? `Exporting ${bulkProgress.done}/${bulkProgress.total}...`
            : "Download all tables (ZIP)"}
        </Button>
      </div>

      <Card className="divide-y">
        {visible.map((t) => (
          <div key={t} className="flex items-center justify-between p-3">
            <code className="text-sm">{t}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportOne(t)}
              disabled={busy === t || bulkProgress !== null}
            >
              <Download className="w-4 h-4 mr-2" />
              {busy === t ? "Exporting..." : "CSV"}
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
