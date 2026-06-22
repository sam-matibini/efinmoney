import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link2, Copy, Share2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PaymentLinkResult = {
  url: string;
  code: string;
  expires_at: string;
  emailed?: boolean;
  recipient_email?: string | null;
};

export type CreatePaymentLinkParams = {
  amount: number;
  currency: string;
  sender_wallet_id: string;
  recipient_name?: string | null;
  recipient_email?: string | null;
  recipient_note?: string | null;
  source?: "send" | "invoice";
};

// Thin wrapper over the payment-link-create edge function. Throws on failure.
export async function createPaymentLink(params: CreatePaymentLinkParams): Promise<PaymentLinkResult> {
  const { data, error } = await supabase.functions.invoke("payment-link-create", {
    body: {
      amount: params.amount,
      currency: params.currency,
      sender_wallet_id: params.sender_wallet_id,
      recipient_name: params.recipient_name || null,
      recipient_email: params.recipient_email || null,
      recipient_note: params.recipient_note || null,
      source: params.source ?? "send",
      base_url: window.location.origin,
    },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "Could not create payment link");
  return {
    url: data.url,
    code: data.code,
    expires_at: data.expires_at,
    emailed: data.emailed,
    recipient_email: data.recipient_email,
  };
}

// Success screen shared by the Domestic and International send flows.
export function PaymentLinkSuccess({
  result,
  amountLabel,
  recipientName,
  onDone,
}: {
  result: PaymentLinkResult;
  amountLabel: string;     // e.g. "C$25.00" or "$25.00"
  recipientName?: string | null;
  onDone: () => void;
}) {
  const mailHref = `mailto:${result.recipient_email || ""}?subject=${encodeURIComponent("You've got a payment")}&body=${encodeURIComponent(`${recipientName ? recipientName + ", " : ""}claim your ${amountLabel} here: ${result.url}`)}`;

  return (
    <Card>
      <CardContent className="py-10 text-center space-y-5">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="w-20 h-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center"
        >
          <Link2 className="w-10 h-10 text-primary" />
        </motion.div>
        <div>
          <h3 className="text-2xl font-display font-bold mb-1">Payment link ready</h3>
          <p className="text-sm text-muted-foreground">
            {amountLabel} is held in escrow until {recipientName || "the recipient"} claims it.
          </p>
          {result.emailed && result.recipient_email && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <MailCheck className="w-4 h-4" /> Emailed to {result.recipient_email}
            </p>
          )}
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/40 text-left">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Claim link</p>
          <code className="block text-sm break-all">{result.url}</code>
          <p className="text-[11px] text-muted-foreground mt-2">
            Expires {new Date(result.expires_at).toLocaleString()} · single use
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={async () => { await navigator.clipboard.writeText(result.url); toast.success("Link copied"); }}>
            <Copy className="w-4 h-4 mr-2" /> Copy link
          </Button>
          {typeof navigator !== "undefined" && (navigator as any).share && (
            <Button variant="outline" onClick={() => (navigator as any).share({ title: "Payment for you", text: `${recipientName || "Hey"}, claim your ${amountLabel} here:`, url: result.url })}>
              <Share2 className="w-4 h-4 mr-2" /> Share
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href={mailHref}>Email it</a>
          </Button>
          <Button variant="outline" onClick={onDone}>Done</Button>
        </div>
      </CardContent>
    </Card>
  );
}
