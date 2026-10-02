import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export type QuickActionType = "send" | "topup" | "request" | "exchange";

const CONFIG: Record<
  QuickActionType,
  { title: string; description: string; recipientLabel?: string; cta: string; toast: string }
> = {
  send: {
    title: "Send Money",
    description: "Start a transfer. You'll pick the payout method on the next screen.",
    recipientLabel: "Recipient",
    cta: "Continue to send",
    toast: "Opening Send with your details…",
  },
  topup: {
    title: "Top Up",
    description: "Add money to your wallet.",
    cta: "Continue to top up",
    toast: "Opening Top Up with your amount…",
  },
  request: {
    title: "Request Money",
    description: "Create a payment link someone can pay from their bank or mobile money.",
    recipientLabel: "Request from",
    cta: "Create request",
    toast: "Opening your request…",
  },
  exchange: {
    title: "Exchange",
    description: "Convert between your wallets at the live rate.",
    cta: "Continue to exchange",
    toast: "Opening Exchange with your amount…",
  },
};

function destination(type: QuickActionType, amount: string, recipient: string, description: string) {
  const q = new URLSearchParams({ amount, quick: "1" });
  if (type === "request") {
    if (recipient) q.set("payer", recipient);
    if (description) q.set("note", description);
    return `/request-money?${q}`;
  }
  if (type === "topup") return `/wallet/topup?${q}`;
  if (type === "exchange") return `/exchange?${q}`;
  return `/send?${q}`;
}

interface QuickActionDrawerProps {
  actionType: QuickActionType | null;
  onClose: () => void;
}

const fieldCls =
  "h-12 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-[var(--font-size-base)] text-white outline-none placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-accent-gold)]";

function DrawerBody({ actionType, onClose }: { actionType: QuickActionType; onClose: () => void }) {
  const navigate = useNavigate();
  const cfg = CONFIG[actionType];
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount.replace(/,/g, ""));

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const confirm = () => {
    navigate(destination(actionType, String(parsed), recipient.trim(), description.trim()));
    toast.info(cfg.toast);
    onClose();
  };

  if (step === "confirm") {
    const rows: [string, string][] = [
      ["Amount", parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
      ...(cfg.recipientLabel && recipient ? [[cfg.recipientLabel, recipient] as [string, string]] : []),
      ...(description ? [["Description", description] as [string, string]] : []),
    ];
    return (
      <div className="space-y-6">
        <dl className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <dt className="text-[var(--color-text-muted)]">{k}</dt>
              <dd className="text-right font-semibold text-white break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-[var(--color-text-muted)]">
          Fees, currency and payout method are confirmed on the next screen before anything is sent.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep("form")}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-label)] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            onClick={confirm}
            className="h-11 flex-1 rounded-[var(--radius-md)] bg-[var(--color-accent-gold)] text-sm font-bold text-[var(--color-bg-primary)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {cfg.cta}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={next} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="qa-amount" className="text-sm font-medium text-[var(--color-text-label)]">
          Amount
        </label>
        <input
          id="qa-amount"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^\d.,]/g, ""));
            setError(null);
          }}
          placeholder="0.00"
          aria-invalid={!!error}
          aria-describedby={error ? "qa-amount-error" : undefined}
          className={`${fieldCls} text-lg font-semibold`}
        />
        {error && (
          <p id="qa-amount-error" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </div>

      {cfg.recipientLabel && (
        <div className="space-y-2">
          <label htmlFor="qa-recipient" className="text-sm font-medium text-[var(--color-text-label)]">
            {cfg.recipientLabel} <span className="text-[var(--color-text-muted)]">(optional)</span>
          </label>
          <input
            id="qa-recipient"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Name"
            className={fieldCls}
          />
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="qa-description" className="text-sm font-medium text-[var(--color-text-label)]">
          Description <span className="text-[var(--color-text-muted)]">(optional)</span>
        </label>
        <input
          id="qa-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's it for?"
          className={fieldCls}
        />
      </div>

      <button
        type="submit"
        className="h-11 w-full rounded-[var(--radius-md)] bg-[var(--color-accent-gold)] text-sm font-bold text-[var(--color-bg-primary)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Continue
      </button>
    </form>
  );
}

/** Quick-action drawer: bottom sheet on mobile, right-hand panel on desktop. */
export default function QuickActionDrawer({ actionType, onClose }: QuickActionDrawerProps) {
  const isMobile = useIsMobile();
  const open = actionType !== null;
  const [shown, setShown] = useState<QuickActionType | null>(actionType);

  useEffect(() => {
    if (actionType) setShown(actionType);
  }, [actionType]);

  const cfg = shown ? CONFIG[shown] : null;
  const body = shown ? <DrawerBody key={`${shown}-${open}`} actionType={shown} onClose={onClose} /> : null;
  const onOpenChange = (o: boolean) => !o && onClose();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)]">
          <div className="mx-auto w-full max-w-md px-6 pb-8">
            <DrawerHeader className="px-0 text-left">
              <DrawerTitle className="text-white">{cfg?.title}</DrawerTitle>
              <DrawerDescription className="text-[var(--color-text-muted)]">{cfg?.description}</DrawerDescription>
            </DrawerHeader>
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 text-[var(--color-text-primary)] sm:max-w-[420px]"
      >
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="text-white">{cfg?.title}</SheetTitle>
          <SheetDescription className="text-[var(--color-text-muted)]">{cfg?.description}</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
