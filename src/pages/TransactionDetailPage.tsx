import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";

const TransactionDetailPage = () => {
  const { journalId } = useParams<{ journalId: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["transaction-journal", journalId],
    queryFn: async () => {
      if (!journalId) return null;
      const { data, error } = await supabase
        .from("ledger_entries")
        .select(
          "id, journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, reference_id, created_at, ledger_accounts(name, code, account_type)"
        )
        .eq("journal_id", journalId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!journalId,
  });

  const entries = data ?? [];
  const first = entries[0];
  const totalDebit = entries.reduce((s, e) => s + Number(e.debit_amount || 0), 0);

  const copyRef = () => {
    if (!journalId) return;
    navigator.clipboard.writeText(journalId);
    toast.success("Reference copied");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="rounded-2xl bg-card border border-border p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Receipt className="w-3.5 h-3.5" />
                {first?.reference_type
                  ? first.reference_type.replace(/_/g, " ").toUpperCase()
                  : "TRANSACTION"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                Transaction Details
              </h1>
              {first && (
                <p className="text-sm text-muted-foreground mt-1">
                  {format(new Date(first.created_at), "PPpp")}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={copyRef}>
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy ref
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No journal entries found for this transaction.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5">Account</th>
                      <th className="text-right px-4 py-2.5">Debit</th>
                      <th className="text-right px-4 py-2.5">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e: any) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">
                            {e.ledger_accounts?.name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {e.ledger_accounts?.code} · {e.description}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {Number(e.debit_amount) > 0
                            ? `${Number(e.debit_amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${e.currency_code}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {Number(e.credit_amount) > 0
                            ? `${Number(e.credit_amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${e.currency_code}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30">
                    <tr>
                      <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                        Total
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {first?.reference_type === "transfer" && first?.reference_id && (
                <div className="mt-4 text-sm">
                  <Link
                    to={`/transfers/${first.reference_id}`}
                    className="text-primary hover:underline"
                  >
                    View transfer →
                  </Link>
                </div>
              )}

              <div className="mt-6 text-xs text-muted-foreground">
                Journal ID: <span className="font-mono">{journalId}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailPage;
