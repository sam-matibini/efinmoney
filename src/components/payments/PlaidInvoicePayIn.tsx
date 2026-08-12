import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LOOP_CAD_INTERAC_ALIAS } from "@/lib/loopCad";
import type { Lang } from "@/components/payments/checkoutStrings";

interface Props {
  walletId: string;
  amount: number;
  transferId?: string;
  purpose?: "topup" | "transfer" | "merchant_collection";
  lang?: Lang;
  /** Auto-open Plaid bank login on mount (Zum Interac flow). Default true. */
  autoOpen?: boolean;
  onComplete?: () => void;
}

/**
 * Interac pay-in: auto-open bank login → authorize payment request → Loop Bank.
 * Not a "link bank" management screen — Plaid opens to complete the transfer.
 */
export default function PlaidInvoicePayIn({
  walletId,
  amount,
  transferId,
  purpose = "topup",
  lang = "en",
  autoOpen = true,
  onComplete,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [doneRef, setDoneRef] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const autoStarted = useRef(false);

  const createDebit = useCallback(
    async (plaidAccountId: string) => {
      setPaying(true);
      try {
        const { data, error } = await supabase.functions.invoke("intra-ca-transfer-create", {
          body: {
            plaid_account_id: plaidAccountId,
            destination_wallet_id: walletId,
            amount_cad: Math.round(amount * 100) / 100,
            purpose,
            transfer_id: transferId || undefined,
            description: transferId
              ? `Interac→Loop pay-in for transfer ${transferId}`
              : "Interac→Loop CAD wallet top-up",
          },
        });
        if (error) throw error;
        if (data?.fallback || data?.success === false) {
          throw new Error(data?.error || "Bank authorization failed");
        }
        if (data?.error) throw new Error(data.error);

        if (purpose === "transfer" && transferId) {
          const { data: execData, error: execErr } = await supabase.functions.invoke("execute-transfer", {
            body: { transfer_id: transferId },
          });
          if (execErr || execData?.error) {
            toast.message(
              lang === "fr"
                ? "Banque autorisée — le transfert sera libéré quand Loop confirmera le dépôt."
                : "Bank authorized — transfer releases when Loop confirms the deposit.",
            );
          } else {
            toast.success(
              lang === "fr" ? "Banque autorisée — transfert en cours" : "Bank authorized — transfer releasing",
            );
          }
        } else {
          toast.success(
            lang === "fr"
              ? `CAD ${amount.toFixed(2)} autorisé via Interac → Loop`
              : `CAD ${amount.toFixed(2)} authorized via Interac → Loop`,
          );
        }

        setDoneRef(String(data?.reference || ""));
        setDone(true);
        onComplete?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not authorize bank payment");
        setDismissed(true);
      } finally {
        setPaying(false);
      }
    },
    [amount, lang, onComplete, purpose, transferId, walletId],
  );

  const openedTokenRef = useRef<string | null>(null);

  const startBankLogin = useCallback(async () => {
    if (amount < 1) {
      toast.error(lang === "fr" ? "Montant minimum CAD 1,00" : "Minimum amount CAD 1.00");
      return;
    }
    setOpening(true);
    setDismissed(false);
    openedTokenRef.current = null;
    try {
      try {
        sessionStorage.setItem("plaid_oauth_continue", `${window.location.pathname}${window.location.search}`);
      } catch {
        /* ignore */
      }
      const redirectUri = `${window.location.origin}/plaid-oauth`;
      const { data, error } = await supabase.functions.invoke("plaid-create-link-token", {
        body: {
          language: lang,
          // Registered in Plaid Dashboard → Team → API → Allowed redirect URIs
          redirect_uri: redirectUri,
        },
      });
      if (error) throw error;
      if (data?.error) {
        // If redirect URI isn't registered yet, retry without it so Auth still works.
        if (/redirect/i.test(String(data.error))) {
          const retry = await supabase.functions.invoke("plaid-create-link-token", {
            body: { language: lang },
          });
          if (retry.error) throw retry.error;
          if (retry.data?.error) throw new Error(retry.data.error);
          setLinkToken(retry.data.link_token);
          return;
        }
        throw new Error(data.error);
      }
      setLinkToken(data.link_token);
    } catch (e) {
      setDismissed(true);
      toast.error(e instanceof Error ? e.message : "Could not open bank login");
    } finally {
      setOpening(false);
    }
  }, [amount, lang]);

  const onPlaidSuccess = useCallback(
    async (public_token: string, metadata: { institution?: { name?: string }; accounts?: Array<{ id?: string }> }) => {
      try {
        setPaying(true);
        const { data, error } = await supabase.functions.invoke("plaid-exchange-token", {
          body: { public_token, institution: metadata.institution },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        await qc.invalidateQueries({ queryKey: ["plaid_accounts", user?.id] });

        const newId =
          (Array.isArray(data?.account_ids) && data.account_ids[0]) ||
          (typeof data?.account_id === "string" && data.account_id) ||
          null;

        let accountId = newId as string | null;
        if (!accountId) {
          const { data: rows } = await supabase
            .from("plaid_accounts")
            .select("id")
            .eq("user_id", user!.id)
            .order("created_at", { ascending: false })
            .limit(1);
          accountId = rows?.[0]?.id ?? null;
        }

        if (!accountId) {
          throw new Error(lang === "fr" ? "Aucun compte bancaire trouvé" : "No bank account found after login");
        }

        await createDebit(accountId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not complete Interac payment");
        setDismissed(true);
        setPaying(false);
      } finally {
        setLinkToken(null);
        openedTokenRef.current = null;
      }
    },
    [createDebit, lang, qc, user],
  );

  const onPlaidExit = useCallback((
    err: { error_code?: string; error_message?: string; display_message?: string } | null,
  ) => {
    setLinkToken(null);
    openedTokenRef.current = null;
    setDismissed(true);
    setOpening(false);
    if (err?.error_code === "INVALID_PHONE_NUMBER") {
      toast.error(
        lang === "fr"
          ? "Numéro refusé par Plaid. Sur l'écran téléphone, choisissez « Continuer sans numéro » / connectez une nouvelle institution, ou vérifiez le format +1…"
          : "Plaid rejected that phone. On the phone screen, choose continue without saving a number / connect a new institution, or use +1 format.",
      );
    } else if (err?.error_message || err?.display_message) {
      toast.error(err.display_message || err.error_message || "Bank login closed");
    }
  }, [lang]);

  const receivedRedirectUri = (() => {
    if (typeof window === "undefined") return undefined;
    if (window.location.href.includes("oauth_state_id=")) return window.location.href;
    try {
      const stored = sessionStorage.getItem("plaid_oauth_return");
      if (stored?.includes("oauth_state_id=")) {
        sessionStorage.removeItem("plaid_oauth_return");
        return stored;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  })();

  const { open, ready, error: linkError } = usePlaidLink({
    token: linkToken || "",
    onSuccess: onPlaidSuccess,
    onExit: (err) => onPlaidExit(err),
    ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
    onEvent: (eventName, metadata) => {
      const meta = metadata as { error_code?: string; view_name?: string; error_message?: string };
      if (eventName === "ERROR" && meta?.error_code === "INVALID_PHONE_NUMBER") {
        toast.message(
          lang === "fr"
            ? "Astuce : ignorez l'enregistrement du téléphone et connectez votre banque directement."
            : "Tip: skip saving your phone with Plaid and connect your bank directly.",
        );
      }
      // Blank "Verify your identity" often surfaces as missing credential fields
      if (
        eventName === "ERROR" &&
        /credential fields|expected credential/i.test(String(meta?.error_message || ""))
      ) {
        toast.error(
          lang === "fr"
            ? "Écran banque incomplet — fermez et rouvrez la connexion bancaire."
            : "Bank form didn’t load — close and reopen bank login.",
        );
        setLinkToken(null);
        openedTokenRef.current = null;
        setDismissed(true);
      }
    },
  });

  useEffect(() => {
    if (linkError) {
      toast.error(linkError.message || "Could not load Plaid Link");
      setDismissed(true);
    }
  }, [linkError]);

  // Open Link once per token — re-opening the same session blanks credential panes.
  useEffect(() => {
    if (!linkToken || !ready) return;
    if (openedTokenRef.current === linkToken) return;
    openedTokenRef.current = linkToken;
    open();
  }, [linkToken, ready, open]);

  // Auto-open bank login when Interac is selected (Zum-style).
  useEffect(() => {
    if (!autoOpen || autoStarted.current || done) return;
    autoStarted.current = true;
    void startBankLogin();
  }, [autoOpen, done, startBankLogin]);

  if (done) {
    return (
      <div className="space-y-2 py-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
        <p className="font-medium">
          {lang === "fr"
            ? `CAD ${amount.toFixed(2)} — Interac autorisé`
            : `CAD ${amount.toFixed(2)} — Interac authorized`}
        </p>
        <p className="text-xs text-muted-foreground">
          {lang === "fr"
            ? `Règlement vers Loop Bank (${LOOP_CAD_INTERAC_ALIAS}).`
            : `Settling to Loop Bank (${LOOP_CAD_INTERAC_ALIAS}).`}
        </p>
        {doneRef && (
          <p className="text-[11px] font-mono text-muted-foreground">Ref: {doneRef}</p>
        )}
      </div>
    );
  }

  const busy = opening || paying || (!!linkToken && !dismissed);

  return (
    <div className="space-y-5 py-2">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
        {lang === "fr"
          ? "Votre banque s'ouvre pour autoriser le Virement Interac. Les fonds sont collectés vers Loop Bank."
          : "Your bank is opening so you can authorize the Interac e-Transfer. Funds collect to Loop Bank."}
      </div>

      {busy && !dismissed ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">
            {paying
              ? lang === "fr"
                ? "Confirmation du paiement…"
                : "Confirming payment…"
              : lang === "fr"
                ? "Ouverture de la connexion bancaire…"
                : "Opening bank login…"}
          </p>
          <p className="text-xs text-muted-foreground">
            {lang === "fr"
              ? "Connectez-vous et autorisez le montant demandé."
              : "Sign in and authorize the requested amount."}
          </p>
          <p className="text-sm font-semibold tabular-nums">CAD {amount.toFixed(2)}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {lang === "fr"
              ? "La fenêtre bancaire s'est fermée. Rouvrez-la pour terminer le paiement Interac."
              : "Bank window closed. Re-open it to finish your Interac payment."}
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{lang === "fr" ? "Montant" : "Amount"}</span>
            <span className="font-semibold tabular-nums">CAD {amount.toFixed(2)}</span>
          </div>
          <Button
            type="button"
            className="h-12 w-full text-base font-semibold"
            disabled={opening || paying}
            onClick={() => void startBankLogin()}
          >
            {(opening || paying) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Building2 className="mr-2 h-4 w-4" />
            {lang === "fr"
              ? `Ouvrir ma banque — payer CAD ${amount.toFixed(2)}`
              : `Open my bank — pay CAD ${amount.toFixed(2)}`}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {lang === "fr" ? "Vers Loop Bank · Interac" : "To Loop Bank · Interac"}
          </p>
        </div>
      )}
    </div>
  );
}
