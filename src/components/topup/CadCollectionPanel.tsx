import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CadInteracTopUpCard from "@/components/payments/CadInteracTopUpCard";
import WiseTopUpCard from "@/components/payments/WiseTopUpCard";
import CheckoutMethodGrid, { type CheckoutMethod } from "@/components/payments/CheckoutMethodGrid";


interface Props {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  onComplete?: () => void;
}

/**
 * Single CAD collection screen: Interac e-Transfer or bank EFT.
 * Both rails create a referenced intent and credit automatically when the deposit arrives.
 */
export default function CadCollectionPanel({ walletId, walletCurrency, initialAmount, onComplete }: Props) {
  const [tab, setTab] = useState<"interac" | "eft">("interac");
  const [eftAvailable, setEftAvailable] = useState<boolean | null>(null);

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
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
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

  return (
    <Card className="border-border bg-gradient-to-br from-muted/40 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Pay from your Canadian bank
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Send CAD with Interac e-Transfer or a bank EFT. Your wallet credits automatically once the
          deposit arrives with your reference.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "interac" | "eft")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="interac">Interac e-Transfer</TabsTrigger>
            <TabsTrigger value="eft">Bank EFT</TabsTrigger>
          </TabsList>

          <TabsContent value="interac" className="mt-4">
            <CadInteracTopUpCard
              walletId={walletId}
              walletCurrency={walletCurrency}
              initialAmount={initialAmount}
              onComplete={onComplete}
            />
          </TabsContent>

          <TabsContent value="eft" className="mt-4">
            {eftAvailable === false ? (
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
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
