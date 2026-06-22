import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link2, Wallet } from "lucide-react";

type RevokePaymentLinkDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortCode: string;
  amount: number;
  currency?: string;
  recipientLabel?: string | null;
  busy?: boolean;
  onConfirm: () => void;
};

export function RevokePaymentLinkDialog({
  open,
  onOpenChange,
  shortCode,
  amount,
  currency = "CAD",
  recipientLabel,
  busy = false,
  onConfirm,
}: RevokePaymentLinkDialogProps) {
  const formatted = `${currency} ${amount.toFixed(2)}`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto sm:mx-0 mb-2 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <Link2 className="w-6 h-6 text-destructive" />
          </div>
          <AlertDialogTitle>Revoke this payment link?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                The claim link will stop working immediately. Anyone with the URL will no longer be able to collect this payment.
              </p>
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Amount in escrow</span>
                  <span className="font-display font-bold text-foreground">{formatted}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Link code</span>
                  <code className="text-xs font-mono">{shortCode}</code>
                </div>
                {recipientLabel ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Recipient</span>
                    <span className="truncate max-w-[180px]">{recipientLabel}</span>
                  </div>
                ) : null}
              </div>
              <p className="flex items-start gap-2 text-sm">
                <Wallet className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <span>
                  <strong className="font-medium text-foreground">{formatted}</strong> will be returned to your wallet right away.
                </span>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep link active</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Revoking…" : "Revoke & return funds"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
