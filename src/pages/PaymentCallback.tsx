import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type Phase = "verifying" | "pending" | "success" | "failed" | "timeout";

interface VerifyResult {
  verified: boolean;
  status?: string;
  amount?: number;
  currency?: string;
  charge_id?: string;
  error?: string;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10; // 30s total

const PaymentCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const transferId = params.get("transfer_id") || (() => {
    try { return sessionStorage.getItem("pending_transfer_id"); } catch { return null; }
  })();
  const type = params.get("type"); // "deposit" | null
  const urlStatus = (params.get("status") || "").toLowerCase();
  const chargeId =
    params.get("charge_id") ||
    params.get("transaction_id") ||
    params.get("id") ||
    params.get("tx_ref");

  const [phase, setPhase] = useState<Phase>("verifying");
  const [info, setInfo] = useState<VerifyResult | null>(null);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollsRef = useRef(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (urlStatus === "cancelled" || urlStatus === "failed") {
      setPhase("failed");
      setErrorMsg(urlStatus === "cancelled" ? "Payment was cancelled" : "Payment failed");
      void markTransferFailed(urlStatus === "cancelled" ? "Cancelled by user" : "Payment failed");
      return;
    }
    if (!chargeId) {
      setPhase("failed");
      setErrorMsg("Missing payment reference in callback URL");
      return;
    }
    void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markTransferCompleted = async (verified: VerifyResult) => {
    if (!transferId) return;
    try {
      await supabase
        .from("transfers")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          provider_reference: verified.charge_id ?? null,
        })
        .eq("id", transferId);
      const { data } = await supabase
        .from("transfers")
        .select("recipient_name")
        .eq("id", transferId)
        .maybeSingle();
      if (data?.recipient_name) setRecipient(data.recipient_name);
    } catch {
      /* ignore */
    }
  };

  const markTransferFailed = async (reason: string) => {
    if (!transferId) return;
    try {
      await supabase
        .from("transfers")
        .update({ status: "failed", failure_reason: reason })
        .eq("id", transferId);
    } catch {
      /* ignore */
    }
  };

  const verify = async () => {
    pollsRef.current += 1;
    try {
      const { data, error } = await supabase.functions.invoke("flw-verify-payment", {
        method: "GET" as any,
        body: undefined,
        headers: undefined,
      } as any).catch(() => ({ data: null, error: { message: "invoke-failed" } as any }));

      // Some clients don't pass query params via invoke — call directly
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flw-verify-payment?charge_id=${encodeURIComponent(chargeId!)}`;
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const result: VerifyResult = await resp.json();

      if (result.verified) {
        setInfo(result);
        await markTransferCompleted(result);
        await queryClient.invalidateQueries({ queryKey: ["wallets"] });
        await queryClient.invalidateQueries({ queryKey: ["transfers"] });
        await queryClient.invalidateQueries({ queryKey: ["ledger-deposits"] });
        try { sessionStorage.removeItem("pending_transfer_id"); } catch { /* ignore */ }
        setPhase("success");
        return;
      }

      const status = String(result.status || "").toLowerCase();
      if (status === "failed" || status === "cancelled") {
        setPhase("failed");
        setErrorMsg(result.error || `Payment ${status}`);
        await markTransferFailed(result.error || `Payment ${status}`);
        return;
      }

      // Pending — poll
      if (pollsRef.current >= MAX_POLLS) {
        setPhase("timeout");
        return;
      }
      setPhase("pending");
      setTimeout(() => void verify(), POLL_INTERVAL_MS);
    } catch (e: any) {
      if (pollsRef.current >= MAX_POLLS) {
        setPhase("timeout");
        return;
      }
      setPhase("pending");
      setTimeout(() => void verify(), POLL_INTERVAL_MS);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center space-y-5">
          {phase === "verifying" && (
            <>
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <h1 className="text-xl font-display font-bold">Verifying payment…</h1>
              <p className="text-sm text-muted-foreground">Hold on while we confirm your transaction with Flutterwave.</p>
            </>
          )}

          {phase === "pending" && (
            <>
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <h1 className="text-xl font-display font-bold">Processing payment…</h1>
              <p className="text-sm text-muted-foreground">
                Your bank is taking a bit longer than usual. We'll keep checking — this can take up to 30 seconds.
              </p>
            </>
          )}

          {phase === "success" && (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="mx-auto h-20 w-20 rounded-full bg-emerald-500/15 flex items-center justify-center"
              >
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </motion.div>
              <h1 className="text-2xl font-display font-bold">Payment Successful! 🎉</h1>
              {info?.amount && info.currency && (
                <p className="text-base text-foreground">
                  <span className="font-semibold">{info.currency} {Number(info.amount).toLocaleString()}</span>
                  {type === "deposit" ? " added to your wallet" : recipient ? ` sent to ${recipient}` : " sent successfully"}
                </p>
              )}
              <div className="flex flex-col gap-2 pt-2">
                {transferId && type !== "deposit" && (
                  <Button onClick={() => navigate(`/transfers/${transferId}`)}>View Transfer</Button>
                )}
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  Back to Dashboard
                </Button>
              </div>
            </>
          )}

          {phase === "failed" && (
            <>
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 14 }}
                className="mx-auto h-20 w-20 rounded-full bg-destructive/15 flex items-center justify-center"
              >
                <XCircle className="h-12 w-12 text-destructive" />
              </motion.div>
              <h1 className="text-2xl font-display font-bold">Payment Failed</h1>
              {errorMsg && <p className="text-sm text-muted-foreground">{errorMsg}</p>}
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => navigate(type === "deposit" ? "/wallets" : "/send")}>Try Again</Button>
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  Back to Dashboard
                </Button>
              </div>
            </>
          )}

          {phase === "timeout" && (
            <>
              <div className="mx-auto h-20 w-20 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Clock className="h-10 w-10 text-amber-500" />
              </div>
              <h1 className="text-xl font-display font-bold">Still processing…</h1>
              <p className="text-sm text-muted-foreground">
                We couldn't confirm your payment within 30 seconds. Don't worry — if it goes through, your wallet
                will update automatically. You can check the status in your transfers list.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                {transferId && (
                  <Button onClick={() => navigate(`/transfers/${transferId}`)}>View Transfer Status</Button>
                )}
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  Back to Dashboard
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentCallback;
