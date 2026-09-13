import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Building2, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LOOP_CAD_EFT, LOOP_CAD_INTERAC_ALIAS, type LoopCadEft } from "@/lib/loopCad";
import { edgeFunctionErrorMessage } from "@/lib/invokeEdgeFunction";
import type { Lang } from "@/components/payments/checkoutStrings";

interface Props {
  walletId: string;
  amount: number;
  transferId?: string;
  purpose?: "topup" | "transfer" | "merchant_collection";
  lang?: Lang;
  /**
   * `eft` (default for linked-bank checkout): Loop institution / transit / account.
   * `interac`: Loop Autodeposit alias as a secondary option — never Fincra.
   */
  rail?: "eft" | "interac";
  /** Skip Plaid Link and register this already-linked `plaid_accounts.id`. */
  existingAccountId?: string;
  fromBankLabel?: string;
  /** Auto-open Plaid on mount. Off for EFT after a bank is already linked. */
  autoOpen?: boolean;
  onComplete?: () => void;
}

/**
 * CAD bank pay-in via Plaid + Loop Bank.
 * Plaid Auth does not pull CAD. After link, the customer pushes EFT (or
 * optional Interac) to Loop. This is not Fincra Autodeposit.
 */
export default function PlaidInvoicePayIn({
  walletId,
  amount,
  transferId,
  purpose = "topup",
  lang = "en",
  rail = "eft",
  existingAccountId,
  fromBankLabel,
  autoOpen,
  onComplete,
}: Props) {
  const shouldAutoOpen = autoOpen ?? rail === "interac";
  const { user } = useAuth();
  const qc = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [settled, setSettled] = useState(false);
  const [doneRef, setDoneRef] = useState<string | null>(null);
  const [loopAlias, setLoopAlias] = useState(LOOP_CAD_INTERAC_ALIAS);
  const [loopEft, setLoopEft] = useState<LoopCadEft | null>(LOOP_CAD_EFT);
  const [dismissed, setDismissed] = useState(false);
  const autoStarted = useRef(false);
  const completedRef = useRef(false);
  const registeredRef = useRef(false);

  const createDebit = useCallback(
    async (plaidAccountId?: string | null) => {
      setPaying(true);
      try {
        const { data, error } = await supabase.functions.invoke("intra-ca-transfer-create", {
          body: {
            ...(plaidAccountId ? { plaid_account_id: plaidAccountId } : {}),
            destination_wallet_id: walletId,
            amount_cad: Math.round(amount * 100) / 100,
            purpose,
            transfer_id: transferId || undefined,
            description: transferId
              ? `EFT→Loop pay-in for transfer ${transferId}`
              : "EFT→Loop CAD wallet top-up",
          },
        });
        if (error) throw new Error(await edgeFunctionErrorMessage(error));
        if (data?.fallback || data?.success === false) {
          throw new Error(data?.error || "Bank authorization failed");
        }
        if (data?.error) throw new Error(data.error);

        // Never call execute-transfer here — Plaid does not pull CAD. Payout releases
        // only after Loop deposit match (wise-webhook → credit → execute-transfer).
        toast.message(
          lang === "fr"
            ? "Envoyez un virement TEF à Loop Bank avec la référence pour libérer le paiement."
            : "Send an EFT to Loop Bank with the reference to release payment.",
        );

        setDoneRef(String(data?.reference || transferId || ""));
        setLoopAlias(String(data?.loop_alias || LOOP_CAD_INTERAC_ALIAS));
        setLoopEft(data?.loop_eft && typeof data.loop_eft === "object" ? data.loop_eft : LOOP_CAD_EFT);
        setDone(true);
        // Keep checkout open so the user can copy Loop deposit instructions.
        // Parent onComplete fires only after funds settle (poll) or explicit dismiss.
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start bank payment");
        setDismissed(true);
      } finally {
        setPaying(false);
      }
    },
    [amount, lang, purpose, transferId, walletId],
  );

  // Poll until Loop deposit is matched (intent settled) — then notify parent.
  useEffect(() => {
    if (!done || !doneRef || settled || completedRef.current) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("fincra_cad_interac_intents")
        .select("status")
        .eq("reference", doneRef)
        .maybeSingle();
      if (cancelled || !data) return;
      if (["settled", "completed", "credited", "confirmed"].includes(String(data.status))) {
        completedRef.current = true;
        setSettled(true);
        void qc.invalidateQueries({ queryKey: ["wallets"] });
        toast.success(
          lang === "fr"
            ? purpose === "transfer"
              ? "Dépôt Loop confirmé — transfert libéré"
              : "Dépôt Loop confirmé — portefeuille crédité"
            : purpose === "transfer"
              ? "Loop deposit confirmed — transfer released"
              : "Loop deposit confirmed — wallet credited",
        );
        onComplete?.();
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [done, doneRef, settled, lang, purpose, onComplete, qc]);

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
      let { data, error } = await supabase.functions.invoke("plaid-create-link-token", {
        body: {
          language: lang,
          // Registered in Plaid Dashboard → Team → API → Allowed redirect URIs
          redirect_uri: redirectUri,
        },
      });

      // Non-2xx: recover body; redirect failures → retry without redirect_uri.
      let errMsg = data?.error as string | undefined;
      if (error) {
        errMsg = await edgeFunctionErrorMessage(error);
      }
      if (errMsg && /redirect/i.test(errMsg)) {
        const retry = await supabase.functions.invoke("plaid-create-link-token", {
          body: { language: lang },
        });
        if (retry.error) throw new Error(await edgeFunctionErrorMessage(retry.error));
        if (retry.data?.error) throw new Error(String(retry.data.error));
        data = retry.data;
        error = null;
        errMsg = undefined;
      }
      if (error) throw new Error(errMsg || (await edgeFunctionErrorMessage(error)));
      if (data?.error) throw new Error(String(data.error));
      if (!data?.link_token) throw new Error("Could not open bank login");
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
        if (error) throw new Error(await edgeFunctionErrorMessage(error));
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
        toast.error(e instanceof Error ? e.message : "Could not complete bank payment");
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

  // Register EFT matching as soon as we have a linked account (or with no Plaid).
  useEffect(() => {
    if (done || paying || registeredRef.current) return;
    if (existingAccountId) {
      registeredRef.current = true;
      void createDebit(existingAccountId);
      return;
    }
    if (rail === "eft" && !shouldAutoOpen) {
      registeredRef.current = true;
      void createDebit(null);
    }
  }, [createDebit, done, existingAccountId, paying, rail, shouldAutoOpen]);

  // Auto-open Plaid only when the caller wants a fresh bank login (not after link).
  useEffect(() => {
    if (!shouldAutoOpen || autoStarted.current || done || existingAccountId) return;
    autoStarted.current = true;
    void startBankLogin();
  }, [shouldAutoOpen, done, existingAccountId, startBankLogin]);

  if (done) {
    const eft = loopEft || LOOP_CAD_EFT;
    const detailsText = [
      `Amount: CAD ${amount.toFixed(2)}`,
      doneRef ? `Reference: ${doneRef}` : null,
      fromBankLabel ? `From: ${fromBankLabel}` : null,
      "",
      "EFT / bank transfer (Loop Bank):",
      `Institution (Bank #): ${eft.bankNumber}`,
      `Transit #: ${eft.transitNumber}`,
      `Account #: ${eft.accountNumber}`,
      "",
      `Optional Interac Autodeposit: ${loopAlias}`,
    ]
      .filter((line) => line !== null)
      .join("\n");

    if (settled) {
      return (
        <div className="space-y-2 py-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <p className="font-medium">
            {lang === "fr"
              ? `CAD ${amount.toFixed(2)} — reçu`
              : `CAD ${amount.toFixed(2)} — received`}
          </p>
          {purpose === "transfer" && (
            <p className="text-sm text-muted-foreground">
              {lang === "fr" ? "Votre transfert est en route." : "Your transfer is on its way."}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {lang === "fr"
            ? "En attente du virement TEF vers Loop Bank — le paiement n'est pas encore reçu."
            : "Waiting for EFT to Loop Bank — payment not received yet."}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {lang === "fr"
            ? `Envoyez exactement CAD ${amount.toFixed(2)} par TEF depuis ${fromBankLabel || "votre banque liée"} vers Loop Bank. Mettez la référence dans le mémo.`
            : `Send exactly CAD ${amount.toFixed(2)} by EFT from ${fromBankLabel || "your linked bank"} to Loop Bank. Put the reference in the memo.`}
        </p>
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">{lang === "fr" ? "Montant" : "Amount"}</span>
            <span className="font-semibold tabular-nums">CAD {amount.toFixed(2)}</span>
          </div>
          {fromBankLabel && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{lang === "fr" ? "De" : "From"}</span>
              <span className="text-right text-xs font-medium">{fromBankLabel}</span>
            </div>
          )}
          {doneRef && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Ref</span>
              <span className="font-mono text-xs">{doneRef}</span>
            </div>
          )}
          <div className="border-t pt-2 space-y-1">
            <p className="text-xs font-semibold">{lang === "fr" ? "TEF Loop Bank" : "Loop Bank EFT"}</p>
            <p className="text-xs text-muted-foreground">Institution: {eft.bankNumber}</p>
            <p className="text-xs text-muted-foreground">Transit: {eft.transitNumber}</p>
            <p className="text-xs text-muted-foreground">Account: {eft.accountNumber}</p>
          </div>
          <div className="border-t pt-2 space-y-1">
            <p className="text-xs text-muted-foreground">
              {lang === "fr" ? "Interac optionnel (Loop, pas Fincra)" : "Optional Interac (Loop, not Fincra)"}
            </p>
            <p className="font-mono text-xs">{loopAlias}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(detailsText);
            toast.success(lang === "fr" ? "Détails copiés" : "Details copied");
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          {lang === "fr" ? "Copier les détails TEF" : "Copy EFT details"}
        </Button>
      </div>
    );
  }

  const busy = opening || paying || (!!linkToken && !dismissed);

  return (
    <div className="space-y-5 py-2">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
        {rail === "eft"
          ? lang === "fr"
            ? "Paiement par TEF vers Loop Bank. Plaid n'effectue pas de prélèvement CAD — envoyez le virement depuis le compte lié."
            : "Pay by EFT to Loop Bank. Plaid does not pull CAD — send the transfer from your linked account."
          : lang === "fr"
            ? "Votre banque s'ouvre pour autoriser le paiement. Les fonds sont collectés vers Loop Bank."
            : "Your bank is opening so you can authorize the payment. Funds collect to Loop Bank."}
      </div>

      {busy && !dismissed ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">
            {paying
              ? lang === "fr"
                ? "Préparation des détails TEF…"
                : "Preparing EFT details…"
              : lang === "fr"
                ? "Ouverture de la connexion bancaire…"
                : "Opening bank login…"}
          </p>
          <p className="text-xs text-muted-foreground">
            {paying
              ? lang === "fr"
                ? "Ensuite, envoyez le virement depuis votre banque liée."
                : "Next, send the transfer from your linked bank."
              : lang === "fr"
                ? "Connectez-vous pour lier le compte."
                : "Sign in to link the account."}
          </p>
          <p className="text-sm font-semibold tabular-nums">CAD {amount.toFixed(2)}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {rail === "eft"
              ? lang === "fr"
                ? "Liez une banque (facultatif) pour attacher une référence, ou copiez les détails TEF à l'étape suivante."
                : "Link a bank (optional) to attach a matching reference, or continue with EFT details."
              : lang === "fr"
                ? "La fenêtre bancaire s'est fermée. Rouvrez-la pour terminer le paiement."
                : "Bank window closed. Re-open it to finish your payment."}
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
              ? `Lier ma banque — CAD ${amount.toFixed(2)}`
              : `Link my bank — CAD ${amount.toFixed(2)}`}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {lang === "fr" ? "Vers Loop Bank · TEF" : "To Loop Bank · EFT"}
          </p>
        </div>
      )}
    </div>
  );
}
