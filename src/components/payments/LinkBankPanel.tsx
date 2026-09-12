import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import BankDetailsForm from "@/components/payments/BankDetailsForm";
import { countryForCurrency, PLAID_COUNTRIES } from "@/lib/bankFieldSchemas";

interface Props {
  walletCurrency: string;
  /** Country to preselect for the manual form (falls back to the currency's country). */
  countryCode?: string | null;
}

export default function LinkBankPanel({ walletCurrency, countryCode }: Props) {
  const currency = walletCurrency.toUpperCase();
  const { user } = useAuth();
  const qc = useQueryClient();

  const country = useMemo(
    () => (countryCode || countryForCurrency(currency)).toUpperCase(),
    [countryCode, currency],
  );
  const plaidSupported = PLAID_COUNTRIES.has(country);

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const startPlaid = useCallback(async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("plaid-create-link-token", {
        body: { country_codes: PLAID_COUNTRIES.has(country) ? [country] : ["CA", "US"] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLinkToken(data.link_token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start bank linking");
    } finally {
      setLinking(false);
    }
  }, [country]);

  const onPlaidSuccess = useCallback(
    async (public_token: string, metadata: { institution?: { name?: string } }) => {
      try {
        const { data, error } = await supabase.functions.invoke("plaid-exchange-token", {
          body: { public_token, institution: metadata.institution },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Bank linked");
        void qc.invalidateQueries({ queryKey: ["plaid_accounts", user?.id] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not link bank");
      } finally {
        setLinkToken(null);
      }
    },
    [qc, user?.id],
  );

  const { open, ready } = usePlaidLink({ token: linkToken || "", onSuccess: onPlaidSuccess });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Link a bank with one tap, or add the account details manually. We ask only for what your
        country's banking system requires. Plaid Instant Auth (Canada & US) pulls a live balance
        and can fund wallet top-ups or same-company bank moves.
      </p>

      <BankDetailsForm
        walletCurrency={currency}
        countryCode={country}
        submitLabel="Save account"
        headerSlot={
          plaidSupported ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={() => void startPlaid()}
              disabled={linking}
            >
              {linking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Building2 className="mr-2 h-4 w-4" />
              )}
              Link your Canada / US bank
            </Button>
          ) : null
        }
      />
    </div>
  );
}
