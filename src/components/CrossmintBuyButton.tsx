import { CrossmintPayButton } from "@crossmint/client-sdk-react-ui";

/**
 * Crossmint embedded checkout button.
 *
 * Env vars (set as Vite public env or Lovable Cloud secrets exposed to the client):
 *  - VITE_CROSSMINT_PROJECT_ID
 *  - VITE_CROSSMINT_COLLECTION_ID
 *  - VITE_CROSSMINT_ENV  ("staging" | "production")
 *
 * Server-side secrets (NEVER exposed to the client, used in edge functions):
 *  - CROSSMINT_API_KEY
 *  - CROSSMINT_WEBHOOK_SECRET
 */
interface CrossmintBuyButtonProps {
  totalPrice: string; // e.g. "0.001" (in the collection's currency)
  quantity?: string;
}

export function CrossmintBuyButton({
  totalPrice,
  quantity = "1",
}: CrossmintBuyButtonProps) {
  const projectId = import.meta.env.VITE_CROSSMINT_PROJECT_ID as string | undefined;
  const collectionId = import.meta.env.VITE_CROSSMINT_COLLECTION_ID as string | undefined;
  const environment = (import.meta.env.VITE_CROSSMINT_ENV as string | undefined) ?? "staging";

  if (!projectId || !collectionId) {
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
    <CrossmintPayButton
      projectId={projectId}
      collectionId={collectionId}
      environment={environment}
      mintConfig={{
        type: "erc-721",
        totalPrice,
        quantity,
      }}
      paymentMethod="fiat"
    />
  );
}

export default CrossmintBuyButton;
