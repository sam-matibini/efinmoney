import {
  CrossmintProvider,
  CrossmintHostedCheckout,
} from "@crossmint/client-sdk-react-ui";

/**
 * Crossmint hosted checkout button.
 *
 * Public env vars (safe in client bundle):
 *  - VITE_CROSSMINT_CLIENT_API_KEY   client-side Crossmint API key (ck_...)
 *  - VITE_CROSSMINT_COLLECTION_ID    target collection
 *
 * Server-side secrets (NEVER exposed to the client, stored in Lovable Cloud):
 *  - CROSSMINT_API_KEY               server-side key (sk_...)
 *  - CROSSMINT_WEBHOOK_SECRET        webhook signing secret (whsec_...)
 */
interface CrossmintBuyButtonProps {
  totalPrice: string; // e.g. "0.001"
  quantity?: number;
}

export function CrossmintBuyButton({
  totalPrice,
  quantity = 1,
}: CrossmintBuyButtonProps) {
  const apiKey = import.meta.env.VITE_CROSSMINT_CLIENT_API_KEY as
    | string
    | undefined;
  const collectionId = import.meta.env.VITE_CROSSMINT_COLLECTION_ID as
    | string
    | undefined;

  if (!apiKey || !collectionId) {
    return (
      <button
        disabled
        className="rounded-lg border border-border bg-muted px-4 py-2 text-sm text-muted-foreground"
      >
        Crossmint not configured
      </button>
    );
  }

  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintHostedCheckout
        lineItems={{
          collectionLocator: `crossmint:${collectionId}`,
          callData: { totalPrice, quantity },
        }}
        payment={{
          crypto: { enabled: true },
          fiat: { enabled: true },
        }}
      />
    </CrossmintProvider>
  );
}

export default CrossmintBuyButton;
