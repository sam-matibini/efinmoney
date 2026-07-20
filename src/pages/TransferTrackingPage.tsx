import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Share2, ArrowLeft, AlertCircle, Download, XCircle, Copy, Smartphone, RefreshCw } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { downloadTransferReceipt } from "@/lib/receipt";
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
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import { ArrowRightLeft, User } from "lucide-react";

const refOf = (id: string) => `EFM-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const friendlyFailureReason = (reason: string): string => {
  const r = reason.toLowerCase();
  if (r.includes("flutterwave") || r.includes("settlement") || r.includes("pending_liquidity") ||
      (r.includes("available") && r.includes("need"))) {
    return "Your transfer is still being processed. Delivery usually completes within a few minutes.";
  }
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
    case "pending_liquidity":
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
  } else if (status === "pending_liquidity") {
    steps[1].state = "done"; steps[1].timestamp = updated;
    steps[2].label = "Delivering to recipient";
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
  const [verifying, setVerifying] = useState(false);
  const cancelTransfer = useCancelTransfer();
  const canCancel = transfer && ["initiated", "funded", "processing", "pending_liquidity"].includes(transfer.status);
  const isPending = transfer && ["initiated", "funded", "processing", "pending_liquidity"].includes(transfer.status);

  // Poll Paysafe for the latest standalone credit status and update our DB.
  const verifyStatus = useCallback(async (silent = false) => {
    if (!id || !transfer) return;
    if (!silent) setVerifying(true);
    try {
      const isPaysafe = transfer.recipient_country === "CA"
        || transfer.transfer_type === "domestic_canada"
        || transfer.payout_method === "interac"
        || transfer.payout_method === "eft";
      const isNombaNgnBank =
        transfer.target_currency === "NGN"
        && (transfer.payout_method === "bank" || transfer.transfer_type === "bank")
        && !!transfer.recipient_bank_code;
      const { data: swychrPayout } = await supabase
        .from("swychr_payout_transactions")
        .select("id")
        .eq("transfer_id", id)
        .maybeSingle();
      const fn = isPaysafe
        ? "paysafe-verify-transfer"
        : swychrPayout
          ? "swychr-verify-transfer"
          : isNombaNgnBank
            ? "nomba-verify-transfer"
            : "flw-verify-transfer";
      const { data, error } = await supabase.functions.invoke(fn, { body: { transfer_id: id } });
      if (error) throw error;
      if (data?.changed && data?.status) {
        const { data: fresh } = await supabase.from("transfers").select("*").eq("id", id).maybeSingle();
        if (fresh) setTransfer(fresh as Transfer);
        if (!silent) {
          data.status === "completed"
            ? toast.success("Delivered! Your transfer is complete.")
            : toast.info(`Transfer status: ${data.status}`);
        }
      } else if (!silent) {
        toast.info(data?.note === "paysafe lookup unavailable"
          ? "Couldn't reach Paysafe — try again shortly."
          : "Still processing — we'll keep checking.");
      }
    } catch {
      if (!silent) toast.error("Couldn't refresh status. Please try again.");
    } finally {
      if (!silent) setVerifying(false);
    }
  }, [id, transfer]);

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

  // While the transfer is still pending, actively poll Flutterwave for the real
  // status (in case the webhook never fires). Backs off after a few minutes.
  const pollCount = useRef(0);
  useEffect(() => {
    if (!isPending) return;
    pollCount.current = 0;
    // immediate silent check on load
    void verifyStatus(true);
    const interval = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current > 20) { clearInterval(interval); return; }
      void verifyStatus(true);
    }, 9000);
    return () => clearInterval(interval);
  }, [isPending, verifyStatus]);

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
    <AppPage width="default" innerClassName="space-y-6">
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
            <PageHeroBanner
              icon={ArrowRightLeft}
              label={`Reference ${refOf(transfer.id)}`}
              value={`${Number(transfer.target_amount).toLocaleString()} ${transfer.target_currency}`}
              meta={[
                { icon: User, text: `To ${transfer.recipient_name}` },
                { text: statusMeta(transfer.status).label },
              ]}
              variant={
                transfer.status === "completed" ? "emerald"
                  : transfer.status === "failed" || transfer.status === "reversed" ? "rose"
                  : "primary"
              }
            />

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
                  {isPending && (
                    <Button variant="outline" size="sm" onClick={() => verifyStatus(false)} disabled={verifying} className="gap-2">
                      <RefreshCw className={`w-4 h-4 ${verifying ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                  )}
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
                          {cancelTransfer.isPending ? <LoadingSpinner size={16} /> : <XCircle className="w-4 h-4" />}
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

            {/* Zambia MoMo payout — processing (no recipient USSD for Elicate sends) */}
            {((transfer.target_currency ?? "").toUpperCase() === "ZMW" ||
              (transfer.recipient_country ?? "").toUpperCase() === "ZM") &&
              ["funded", "processing"].includes(transfer.status) && (
              <Card className="border-emerald-500/40 bg-emerald-500/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    Payout processing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    We’re sending{" "}
                    <span className="font-medium text-foreground">
                      {currencySymbol(transfer.target_currency)}
                      {Number(transfer.target_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
                      {transfer.target_currency}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium text-foreground">
                      {transfer.recipient_phone || "the recipient"}
                    </span>
                    . This usually completes within a few minutes — you’ll see the status update here.
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
                            <LoadingSpinner size={24} />
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
                {transfer.status === "pending_liquidity" && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-foreground">
                    Your payment was received. We're completing delivery to your recipient — this usually takes a few minutes.
                  </div>
                )}
                {transfer.failure_reason && transfer.status !== "pending_liquidity" && (
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
      </AppPage>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-medium text-foreground">{value}</p>
  </div>
);

export default TransferTrackingPage;
