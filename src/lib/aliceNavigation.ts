/**
 * Client tools the ElevenLabs Alice agent can call in the browser. Alice can open pages
 * (optionally pre-filling an amount) but never submits anything: the user still reviews
 * and confirms on the page itself.
 *
 * Page keys must match the `navigate_to_page` enum in supabase/functions/_shared/aliceTools.ts.
 */
import { productFeatures } from "@/lib/productFeatures";

type Page = { path: string; label: string; prefill?: boolean; enabled?: () => boolean };

export const ALICE_PAGES: Record<string, Page> = {
  dashboard: { path: "/dashboard", label: "your dashboard" },
  send: { path: "/send", label: "Send Money", prefill: true },
  exchange: { path: "/exchange", label: "Exchange", prefill: true },
  top_up: { path: "/wallet/topup", label: "Top Up", prefill: true },
  request_money: { path: "/request-money", label: "Request Money", prefill: true, enabled: () => productFeatures.requestMoney },
  receive_or_bank_details: { path: "/wallet/receive", label: "your bank details (Receive)" },
  wallets: { path: "/wallets", label: "Wallets" },
  transactions: { path: "/transfers", label: "your transfers" },
  contacts: { path: "/contacts", label: "Contacts" },
  pay_bills: { path: "/pay-bills", label: "Pay Bills", enabled: () => productFeatures.billPay },
  verification: { path: "/kyc", label: "Verification" },
  business: { path: "/business", label: "Business" },
  profile_settings: { path: "/profile", label: "Profile settings" },
  security: { path: "/security", label: "Security settings" },
  support: { path: "/support?new=1", label: "Support (new request)" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AliceClientTools = Record<string, (params: any) => Promise<string> | string>;

/** Stable tool map for a session that always calls the handlers currently in `ref`. */
export function delegateClientTools(ref: { current: AliceClientTools | undefined }): AliceClientTools {
  return {
    navigate_to_page: (params) =>
      ref.current?.navigate_to_page
        ? ref.current.navigate_to_page(params)
        : "Page navigation isn't available here. Tell the user which page to open.",
  };
}

export function buildAliceClientTools(opts: {
  navigate: (path: string) => void;
  onTalkToHuman?: () => void;
  onBookCall?: () => void;
  onNavigated?: (page: string) => void;
}): AliceClientTools {
  return {
    navigate_to_page: ({ page, amount }: { page?: string; amount?: number | string }) => {
      const key = String(page || "").trim();
      if (key === "talk_to_human" || key === "book_call") {
        const handler = key === "talk_to_human" ? opts.onTalkToHuman : opts.onBookCall;
        if (!handler) {
          opts.navigate(ALICE_PAGES.support.path);
          return "Opened the Support page so the user can reach the eFinMoney team.";
        }
        handler();
        return key === "talk_to_human"
          ? "Connecting the user to live chat with the eFinMoney support team in a moment. Say a short goodbye."
          : "Opening the screen to book a call with the eFinMoney team in a moment. Say a short goodbye.";
      }
      const target = ALICE_PAGES[key];
      if (!target) return `Unknown page "${key}". Tell the user which page to open instead.`;
      if (target.enabled && !target.enabled()) return `${target.label} is not available for this account yet.`;

      let path = target.path;
      const n = Number(amount);
      if (target.prefill && Number.isFinite(n) && n > 0) {
        path += `${path.includes("?") ? "&" : "?"}amount=${encodeURIComponent(String(n))}&quick=1`;
      }
      opts.navigate(path);
      opts.onNavigated?.(key);
      return target.prefill && n > 0
        ? `Opened ${target.label} with ${n} pre-filled. The user must review and confirm it themselves.`
        : `Opened ${target.label}.`;
    },
  };
}
