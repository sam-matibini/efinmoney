import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Circle, Share2, ArrowLeft, AlertCircle, Download, XCircle, Copy, Smartphone } from "lucide-react";
import { downloadTransferReceipt } from "@/lib/receipt";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCancelTransfer, type Transfer } from "@/hooks/useTransfers";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

const refOf = (id: string) => `EFM-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const friendlyFailureReason = (reason: string): string => {
  const r = reason.toLowerCase();
  if (r.includes("provider setup required") || r.includes("ip whitelist") || r.includes("whitelisting")) {
    return "This payout corridor is temporarily unavailable. Your funds have been returned to your wallet. Please try again shortly or contact support.";
  }
  if (r.includes("provider balance low") || r.includes("insufficient funds in customer wallet") || (r.includes("insufficient") && r.includes("wallet"))) {
    return "Payouts in this currency are temporarily unavailable due to a provider balance issue. Your funds have been returned to your wallet. Please try again shortly or contact support.";
  }
  if (r.includes("paymenthub-1") || r.includes("payment type and currency code combination")) {
    return "This payout corridor is not yet enabled on our payments provider. Your funds have been returned to your wallet. Please try again later or contact support.";
  }
  if (r.includes("payouts_not_allowed") || r.includes("card payouts are not yet enabled") || r.includes("insufficient_capabilities") || r.includes("not allowed to make payouts")) {
    return "Card payouts are not yet enabled on our payments provider. Your funds have been returned to your wallet. Please try again later or contact support.";
  }
  if (r.includes("card_declined") || r.includes("card was declined")) {
    return "The recipient's debit card was declined. Your funds have been returned to your wallet.";
  }
  if (r.includes("debit card") && r.includes("instant")) {
    return "Only Canadian debit cards can receive instant payouts. Please ask the recipient for a debit card.";
  }
  return reason.replace(/\s*\(raw:[^)]*\)\s*/gi, "").trim();
};

const currencySymbol = (code: string) => {
  const map: Record<string, string> = {
    USD: "$", CAD: "C$", EUR: "€", GBP: "£", NGN: "₦",
    KES: "KSh", UGX: "USh", TZS: "TSh", ZMW: "ZK", BIF: "FBu",
  };
  return map[code] || code + " ";
};

const statusMeta = (status: string) => {
  switch (status) {
    case "completed":
      return { label: "Completed", className: "bg-indigo-500/20 text-primary border-indigo-500/40" };
    case "failed":
    case "reversed":
    case "expired":
      return { label: status[0].toUpperCase() + status.slice(1), className: "bg-destructive/20 text-destructive border-destructive/40" };
    case "processing":
    case "funded":
      return { label: "Processing", className: "bg-yellow-500/20 text-yellow-500 border-yellow-500/40" };
    default:
      return { label: "Initiated", className: "bg-amber-500/20 text-amber-600 border-amber-500/40" };
  }
};

interface TimelineStep {
  key: string;
  label: string;
  state: "done" | "current" | "future" | "failed";
  timestamp?: string;
}

const buildTimeline = (t: Transfer): TimelineStep[] => {
  const created = t.created_at;
  const updated = t.updated_at;
  const completed = t.completed_at;
  const status = t.status;
  const failed = ["failed", "reversed", "expired"].includes(status);

  const steps: TimelineStep[] = [
    { key: "init", label: "Transfer Initiated", state: "done", timestamp: created },
    { key: "funded", label: "Payment Received", state: "future" },
    { key: "processing", label: "Processing Payout", state: "future" },
    { key: "delivered", label: "Delivered to Recipient", state: "future" },
  ];

  if (status === "initiated") {
    steps[1].state = "current";
  } else if (status === "funded") {
    steps[1].state = "done"; steps[1].timestamp = updated;
    steps[2].state = "current";
  } else if (status === "processing") {
    steps[1].state = "done"; steps[1].timestamp = updated;
    steps[2].state = "current";
  } else if (status === "completed") {
    steps[1].state = "done"; steps[1].timestamp = updated;
    steps[2].state = "done"; steps[2].timestamp = updated;
    steps[3].state = "done"; steps[3].timestamp = completed || updated;
  } else if (failed) {
    if (status === "expired") {
      steps[1].state = "failed";
      steps[1].timestamp = updated;
    } else {
      // Payment was received (and likely refunded); payout step failed.
      steps[1].state = "done";
      steps[1].timestamp = updated;
      steps[2].state = "failed";
      steps[2].timestamp = updated;
    }
  }

  return steps;
};

const TransferTrackingPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const cancelTransfer = useCancelTransfer();
  const canCancel = transfer && ["initiated", "funded", "processing"].includes(transfer.status);

  const handleCancel = async () => {
    if (!transfer) return;
    try {
      await cancelTransfer.mutateAsync(transfer.id);
      toast.success("Transfer cancelled — funds returned to your wallet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel transfer");
    }
  };

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setTransfer(data as Transfer);
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`transfer-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "transfers", filter: `id=eq.${id}` },
        (payload) => {
          setTransfer(payload.new as Transfer);
          toast.info(`Transfer status: ${(payload.new as Transfer).status}`);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id, user]);

  const handleShare = async () => {
    const { shortenUrl } = await import("@/lib/shortLink");
    const url = id
      ? await shortenUrl(`/transfers/${id}`, {})
      : window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Track my transfer", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Tracking link copied");
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6 max-w-3xl mx-auto space-y-6">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link to="/transfers"><ArrowLeft className="w-4 h-4" /> All transfers</Link>
        </Button>

        {loading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : notFound || !transfer ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground" />
              <h2 className="text-lg font-semibold">Transfer not found</h2>
              <p className="text-sm text-muted-foreground">We couldn't find this transfer.</p>
              <Button asChild><Link to="/transfers">View all transfers</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <CardTitle className="font-display">{refOf(transfer.id)}</CardTitle>
                  <Badge variant="outline" className={`mt-2 ${statusMeta(transfer.status).className}`}>
                    {statusMeta(transfer.status).label}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => downloadTransferReceipt(transfer.id)} className="gap-2">
                    <Download className="w-4 h-4" /> Receipt
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
                    <Share2 className="w-4 h-4" /> Share
                  </Button>
                  {canCancel && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="gap-2" disabled={cancelTransfer.isPending}>
                          {cancelTransfer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                          Cancel
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel this transfer?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The full amount, including fees, will be refunded to your wallet immediately. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep transfer</AlertDialogCancel>
                          <AlertDialogAction onClick={handleCancel}>Yes, cancel & refund</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardHeader>
            </Card>

            {/* Elicate USSD waiting banner — only for Zambia mobile-money payouts in pending states */}
            {((transfer.target_currency ?? "").toUpperCase() === "ZMW" ||
              (transfer.recipient_country ?? "").toUpperCase() === "ZM") &&
              ["funded", "processing"].includes(transfer.status) && (
              <Card className="border-yellow-500/40 bg-yellow-500/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-yellow-500" />
                    Waiting for recipient to approve on their phone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    A USSD prompt has been pushed to <span className="font-medium text-foreground">{transfer.recipient_phone || "the recipient"}</span>.
                    They need to enter their Mobile Money PIN to receive <span className="font-medium text-foreground">
                    {currencySymbol(transfer.target_currency)}{Number(transfer.target_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} {transfer.target_currency}</span>.
                    Funds will land instantly once they confirm.
                  </p>
                  <div className="rounded-lg border border-border/60 bg-muted/40 p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">If they didn't see the prompt, ask them to dial:</p>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li>• <span className="font-mono text-foreground">*303#</span> — MTN Money → Pending Approvals</li>
                      <li>• <span className="font-mono text-foreground">*778#</span> — Airtel Money → My Account → Pending Transactions</li>
                      <li>• <span className="font-mono text-foreground">*422#</span> — Zamtel Kwacha → Approvals</li>
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Prompts expire after ~2 minutes. If it times out, the transfer will fail and funds return to your wallet automatically.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader><CardTitle>Tracking Timeline</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-6">
                  {buildTimeline(transfer).map((step, i) => (
                    <motion.li
                      key={step.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex gap-4"
                    >
                      <div className="flex flex-col items-center">
                        {step.state === "done" && (
                          <CheckCircle2 className="w-6 h-6 text-primary" />
                        )}
                        {step.state === "current" && (
                          <div className="relative">
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                          </div>
                        )}
                        {step.state === "future" && (
                          <Circle className="w-6 h-6 text-muted-foreground/40" />
                        )}
                        {step.state === "failed" && (
                          <AlertCircle className="w-6 h-6 text-destructive" />
                        )}
                        {i < 3 && (
                          <div className={`w-0.5 flex-1 mt-1 min-h-8 ${step.state === "done" ? "bg-indigo-500/50" : "bg-muted"}`} />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className={`font-medium ${
                          step.state === "future" ? "text-muted-foreground" :
                          step.state === "failed" ? "text-destructive" : "text-foreground"
                        }`}>
                          {step.label}
                        </p>
                        {step.timestamp && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(step.timestamp), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </ol>
                {transfer.failure_reason && (
                  <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                    {friendlyFailureReason(transfer.failure_reason)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Details */}
            <Card>
              <CardHeader><CardTitle>Transfer Details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <Detail label="Amount Sent" value={`${currencySymbol(transfer.source_currency)}${Number(transfer.source_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${transfer.source_currency}`} />
                <Detail label="Recipient Receives" value={`${currencySymbol(transfer.target_currency)}${Number(transfer.target_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${transfer.target_currency}`} />
                <Detail label="Exchange Rate" value={`1 ${transfer.source_currency} = ${Number(transfer.exchange_rate).toFixed(4)} ${transfer.target_currency}`} />
                <Detail label="Fee" value={`${currencySymbol(transfer.source_currency)}${Number(transfer.fee_amount).toFixed(2)}`} />
                <Detail label="Recipient" value={transfer.recipient_name} />
                <Detail label="Phone" value={transfer.recipient_phone || "—"} />
                <Detail label="Destination" value={transfer.recipient_country} />
                <Detail label="Payout Method" value={transfer.payout_method || transfer.transfer_type} />
                <Detail
                  label="Estimated Delivery"
                  value={transfer.status === "completed"
                    ? `Delivered ${formatDistanceToNow(new Date(transfer.completed_at || transfer.updated_at), { addSuffix: true })}`
                    : "Within minutes"}
                />
                <Detail label="Initiated" value={format(new Date(transfer.created_at), "MMM d, yyyy h:mm a")} />
              </CardContent>
            </Card>

            {(transfer as any).stellar_tx_hash && (
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    ⭐ On-Chain Receipt
                    <Badge variant="secondary" className="text-[10px]">Stellar</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    This transfer is being delivered through the Stellar network. You can watch the funds move in real time on the blockchain explorer.
                  </p>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/60 border border-border/50">
                    <code className="text-[11px] sm:text-xs break-all flex-1 font-mono">
                      {(transfer as any).stellar_tx_hash}
                    </code>
                  </div>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${(transfer as any).stellar_tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    View on StellarExpert →
                  </a>
                </CardContent>
              </Card>
            )}

            {transfer.recipient_country === "CA"
              && transfer.payout_method === "interac"
              && (transfer as any).interac_security_question
              && (transfer as any).interac_security_answer && (
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-base">Interac Security Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    Share these with your recipient privately so they can claim the e-Transfer.
                  </p>
                  <Detail label="Security Question" value={(transfer as any).interac_security_question} />
                  <div className="flex items-end justify-between gap-2">
                    <Detail label="Answer" value={(transfer as any).interac_security_answer} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(String((transfer as any).interac_security_answer || ""));
                        toast.success("Security answer copied");
                      }}
                    >
                      <Copy className="h-4 w-4 mr-1" /> Copy Answer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
      <MobileNav />
    </div>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-medium text-foreground">{value}</p>
  </div>
);

export default TransferTrackingPage;
