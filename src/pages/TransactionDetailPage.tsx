import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Receipt, CheckCircle2, Clock, XCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cleanIncomingTransactionLabel } from "@/lib/incomingTransactions";
import TransactionShareBar from "@/components/transactions/TransactionShareBar";

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
  const referenceLabel = first?.reference_type
    ? cleanIncomingTransactionLabel(first.description, first.reference_type).toUpperCase()
    : "TRANSACTION";

  // Detect Payment Link escrow/release journals: description format "Payment Link escrow [CODE]" or "Payment Link release [CODE]"
  const plMatch = first?.description?.match(/Payment Link (escrow|release) \[([A-Z0-9]+)\]/i);
  const plKind = plMatch?.[1]?.toLowerCase() as "escrow" | "release" | undefined;
  const plCode = plMatch?.[2];

  const { data: plLink } = useQuery({
    queryKey: ["payment-link-banner", plCode],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_link_payouts" as any)
        .select("short_code, short_url, status, claimed_method, claimed_at, expires_at, recipient_name, amount, currency")
        .eq("short_code", plCode!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!plCode,
  });

  const { data: plCounterJournalId } = useQuery({
    queryKey: ["payment-link-counter-journal", plCode, plKind],
    queryFn: async () => {
      const counter = plKind === "escrow" ? "release" : "escrow";
      const { data } = await supabase
        .from("ledger_entries")
        .select("journal_id")
        .ilike("description", `Payment Link ${counter} [${plCode}]%`)
        .limit(1)
        .maybeSingle();
      return (data as any)?.journal_id as string | undefined;
    },
    enabled: !!plCode && !!plKind && plLink?.status === "claimed",
  });

  const copyRef = () => {
    if (!journalId) return;
    navigator.clipboard.writeText(journalId);
    toast.success("Reference copied");
  };


  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <button
          onClick={() => navigate(-1)}
          className="no-print flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="rounded-2xl bg-card border border-border p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Receipt className="w-3.5 h-3.5" />
                {referenceLabel}
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
            <Button variant="outline" size="sm" onClick={copyRef} className="no-print">
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
              <TransactionShareBar
                entries={entries as any}
                journalId={journalId!}
                referenceLabel={referenceLabel}
                firstDate={first?.created_at}
                statusLine={plLink ? (plLink.status === "claimed"
                  ? `Paid · claimed via ${plLink.claimed_method?.toUpperCase() || "—"}`
                  : plLink.status === "pending" ? "Awaiting claim"
                  : plLink.status === "expired" ? "Expired · funds returned"
                  : plLink.status === "revoked" ? "Revoked · funds returned" : undefined) : undefined}
              />
              {plLink && (() => {
                const status = plLink.status as string;
                const isPaid = status === "claimed";
                const isPending = status === "pending";
                const isClosed = status === "expired" || status === "revoked";
                const tone = isPaid
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  : isPending
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                  : "bg-muted border-border text-muted-foreground";
                const Icon = isPaid ? CheckCircle2 : isPending ? Clock : XCircle;
                const label = isPaid
                  ? `Paid · claimed via ${plLink.claimed_method?.toUpperCase() || "—"}`
                  : isPending
                  ? "Awaiting claim"
                  : status === "expired" ? "Expired · funds returned" : "Revoked · funds returned";
                const when = isPaid && plLink.claimed_at
                  ? formatDistanceToNow(new Date(plLink.claimed_at), { addSuffix: true })
                  : isPending && plLink.expires_at
                  ? `expires ${formatDistanceToNow(new Date(plLink.expires_at), { addSuffix: true })}`
                  : "";
                return (
                  <div className={`mb-4 rounded-xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${tone}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-5 h-5 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{label}</div>
                        <div className="text-xs opacity-80 truncate">
                          Payment link <span className="font-mono">{plCode}</span>
                          {plLink.recipient_name ? ` · ${plLink.recipient_name}` : ""}
                          {when ? ` · ${when}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isPaid && plCounterJournalId && (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/transactions/${plCounterJournalId}`}>
                            {plKind === "escrow" ? "View payout entry" : "View escrow entry"}
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline">
                        <Link to="/payment-links">All links</Link>
                      </Button>
                    </div>
                  </div>
                );
              })()}
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

              {(first?.reference_type === "transfer" || first?.reference_type === "internal_transfer") && first?.reference_id && (
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
  );
};

export default TransactionDetailPage;
