import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Player } from "@remotion/player";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { downloadTransferReceipt } from "@/lib/receipt";
import {
  DeliverySequence, DELIVERY_DURATION, DELIVERY_W, DELIVERY_H,
} from "@/remotion/DeliverySequence";

const CURRENCY_FLAG: Record<string, string> = {
  USD: "🇺🇸", CAD: "🇨🇦", EUR: "🇪🇺", GBP: "🇬🇧", NGN: "🇳🇬", KES: "🇰🇪",
  GHS: "🇬🇭", ZAR: "🇿🇦", UGX: "🇺🇬", TZS: "🇹🇿", ZMW: "🇿🇲",
};

/** Single source of truth for status copy — must match TransferTrackingPage. */
const liveStatus = (status: string): { label: string; tone: string; done: boolean } => {
  switch (status) {
    case "completed":
      return { label: "Delivered to recipient", tone: "bg-primary/15 text-primary border-primary/40", done: true };
    case "failed":
    case "reversed":
    case "expired":
      return { label: "Transfer failed — funds returned", tone: "bg-destructive/15 text-destructive border-destructive/40", done: false };
    case "processing":
    case "funded":
      return { label: "Processing payout…", tone: "bg-yellow-500/15 text-yellow-600 border-yellow-500/40", done: false };
    default:
      return { label: "Payment received…", tone: "bg-amber-500/15 text-amber-600 border-amber-500/40", done: false };
  }
};

interface Props {
  transferId: string | null;
  amount: number;
  currency: string;
  recipientName: string;
  targetFlag: string;
  onSendAnother: () => void;
}

const TransferSuccess = ({ transferId, amount, currency, recipientName, targetFlag, onSendAnother }: Props) => {
  const [status, setStatus] = useState<string>("processing");

  useEffect(() => {
    if (!transferId) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    const stopIfTerminal = (st: string) =>
      ["completed", "failed", "reversed", "expired", "cancelled"].includes(st);

    supabase.from("transfers").select("status").eq("id", transferId).maybeSingle().then(({ data }) => {
      if (!cancelled && data?.status) setStatus(data.status);
    });

    // Actively confirm with Flutterwave in case the webhook never lands.
    const verify = async () => {
      try {
        const { data } = await supabase.functions.invoke("flw-verify-transfer", { body: { transfer_id: transferId } });
        if (!cancelled && data?.status) setStatus(data.status);
        if (data?.status && stopIfTerminal(data.status) && timer) clearInterval(timer);
      } catch { /* ignore */ }
    };
    void verify();
    timer = setInterval(() => {
      attempts += 1;
      if (attempts > 8) { if (timer) clearInterval(timer); return; }
      void verify();
    }, 9000);

    const channel = supabase
      .channel(`send-success-${transferId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "transfers", filter: `id=eq.${transferId}` },
        (payload) => setStatus((payload.new as { status: string }).status))
      .subscribe();
    return () => { cancelled = true; if (timer) clearInterval(timer); supabase.removeChannel(channel); };
  }, [transferId]);

  const s = liveStatus(status);
  const failed = ["failed", "reversed", "expired"].includes(status);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <Player
          component={DeliverySequence}
          inputProps={{
            amount: amount.toFixed(2),
            currency,
            recipientName: recipientName || "your recipient",
            sourceFlag: CURRENCY_FLAG[currency] || "💸",
            targetFlag: targetFlag || "🌍",
          }}
          durationInFrames={DELIVERY_DURATION}
          compositionWidth={DELIVERY_W}
          compositionHeight={DELIVERY_H}
          fps={30}
          autoPlay
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          style={{ width: "100%", aspectRatio: `${DELIVERY_W} / ${DELIVERY_H}` }}
        />

        <div className="px-6 pb-8 pt-2 text-center">
          <motion.h3
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="font-display text-2xl font-bold"
          >
            {failed ? "Transfer Failed" : s.done ? "Delivered! 🎉" : "Transfer Sent!"}
          </motion.h3>

          <div className="mt-3 flex justify-center">
            <Badge variant="outline" className={`gap-1.5 ${s.tone}`}>
              {s.done ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : !failed ? (
                <LoadingSpinner size={12} />
              ) : null}
              {s.label}
            </Badge>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            {currency} {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            {s.done ? " was delivered to " : " is on its way to "}
            <span className="font-medium text-foreground">{recipientName}</span>
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {transferId && (
              <Button asChild>
                <Link to={`/transfers/${transferId}`}>Track your transfer</Link>
              </Button>
            )}
            {transferId && (
              <Button variant="outline" onClick={() => downloadTransferReceipt(transferId)}>
                Download Receipt
              </Button>
            )}
            <Button variant="outline" onClick={onSendAnother}>Send Another</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TransferSuccess;
