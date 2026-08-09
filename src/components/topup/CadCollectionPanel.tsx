import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import InteracCheckout from "@/components/payments/InteracCheckout";
import WiseTopUpCard from "@/components/payments/WiseTopUpCard";
import CheckoutMethodGrid, { type CheckoutMethod } from "@/components/payments/CheckoutMethodGrid";
import CheckoutShell from "@/components/payments/CheckoutShell";
import { type Lang } from "@/components/payments/checkoutStrings";

interface Props {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  onComplete?: () => void;
}

/**
 * Hosted CAD collection checkout: pick a rail, fill one payer form, pay.
 * Both rails create a referenced intent and credit automatically once the
 * deposit arrives.
 */
export default function CadCollectionPanel({ walletId, walletCurrency, initialAmount, onComplete }: Props) {
  const [method, setMethod] = useState<CheckoutMethod | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [eftAvailable, setEftAvailable] = useState<boolean | null>(null);
  const isCad = walletCurrency.toUpperCase() === "CAD";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wise-topup-intent?diagnose=1`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token || ""}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            },
          },
        );
        const json = await res.json().catch(() => ({}));
        const active = Array.isArray(json?.currencies_active)
          ? (json.currencies_active as string[]).map((c) => String(c).toUpperCase())
          : [];
        if (!cancelled) setEftAvailable(Boolean(json?.ok) && active.includes("CAD"));
      } catch {
        if (!cancelled) setEftAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const amount = Number(initialAmount) > 0 ? Number(initialAmount) : 0;
  const amountLabel = `CAD ${amount.toFixed(2)}`;

  return (
    <CheckoutShell
      lang={lang}
      onLangChange={setLang}
      onBack={method ? () => setMethod(null) : undefined}
      summary={{
        payeeName: "eFinMoney wallet top-up",
        amountLabel,
        description: "Funds are credited to your CAD wallet automatically once the deposit arrives.",
        lineItem: `CAD wallet top-up${walletCurrency ? ` (${walletCurrency.toUpperCase()})` : ""}`,
      }}
    >
      {method === null ? (
        <CheckoutMethodGrid
          amountLabel={amount > 0 ? amountLabel : undefined}
          value={"interac"}
          onChange={setMethod}
          interacAvailable={isCad}
          lang={lang}
        />
      ) : method === "interac" ? (
        <InteracCheckout
          walletId={walletId}
          purpose="topup"
          initialAmount={initialAmount}
          lang={lang}
          onComplete={onComplete}
        />
      ) : eftAvailable === false ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Bank EFT is not available yet for CAD. Use Interac e-Transfer in the meantime.
        </div>
      ) : (
        <WiseTopUpCard
          walletId={walletId}
          walletCurrency={walletCurrency}
          initialAmount={initialAmount}
          onComplete={onComplete}
        />
      )}
    </CheckoutShell>
  );
}

