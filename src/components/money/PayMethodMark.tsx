import type { PayTone } from "@/components/money/PaymentMethodRow";
import { cn } from "@/lib/utils";
import walletMark from "@/assets/nav-icons/wallets.svg";

type PayMarkKind = "card" | "bank" | "interac" | "wise" | "wallet" | "mobile";

const CARD_IDS = new Set([
  "card",
  "nomba",
  "square",
  "paypal",
  "dodo",
  "lenhub",
  "epay",
  "bambora",
  "elicate",
]);

const INTERAC_IDS = new Set(["interac", "plaid"]);
const WISE_IDS = new Set(["wise", "wise_link"]);

function resolvePayMark(id?: string, tone?: PayTone): PayMarkKind {
  const key = (id || "").toLowerCase();
  if (INTERAC_IDS.has(key) || key.includes("interac")) return "interac";
  if (WISE_IDS.has(key) || tone === "wise") return "wise";
  if (key === "wallet" || tone === "wallet") return "wallet";
  if (tone === "mobile" || key.includes("momo") || key === "ghana") return "mobile";
  if (CARD_IDS.has(key) || tone === "card") return "card";
  return "bank";
}

/** Brand payment-method art for checkout sidebars (Visa/MC, Interac, Wise, bank, wallet). */
export default function PayMethodMark({
  id,
  tone,
  kind,
  className,
}: {
  id?: string;
  tone?: PayTone;
  kind?: PayMarkKind;
  className?: string;
}) {
  const mark = kind ?? resolvePayMark(id, tone);
  return (
    <span className={cn("flex h-9 w-9 items-center justify-center", className)} aria-hidden>
      {mark === "card" && <CardMark />}
      {mark === "bank" && <BankMark />}
      {mark === "interac" && <InteracMark />}
      {mark === "wise" && <WiseMark />}
      {mark === "wallet" && (
        <img src={walletMark} alt="" width={36} height={36} className="h-full w-full rounded-lg" />
      )}
      {mark === "mobile" && <MobileMark />}
    </span>
  );
}

/** Visa / Mastercard / Amex glyph for a saved card row. */
export function CardBrandMark({ brand, className }: { brand?: string | null; className?: string }) {
  const b = (brand || "").toLowerCase();
  if (b === "mastercard" || b === "master") return <MastercardCircles className={className} />;
  if (b === "amex" || b === "american_express" || b === "americanexpress") {
    return <AmexBox className={className} />;
  }
  return <VisaWordmark className={className} />;
}

function CardMark() {
  return (
    <svg viewBox="0 0 36 36" className="h-full w-full" fill="none" aria-hidden>
      <rect width="36" height="36" rx="8" fill="#EEF2FF" />
      <rect x="4" y="9" width="28" height="18" rx="3" fill="#1A1F71" />
      <rect x="6.5" y="13" width="6" height="4" rx="0.8" fill="#F5C451" />
      <g transform="translate(13.2 12.4) scale(0.4)" fill="#fff">
        <path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z" />
      </g>
      <circle cx="23.2" cy="23.4" r="3.1" fill="#EB001B" />
      <circle cx="27.1" cy="23.4" r="3.1" fill="#F79E1B" />
    </svg>
  );
}

function VisaWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} aria-hidden>
      <rect width="24" height="24" rx="4" fill="#1A1F71" />
      <path
        fill="#fff"
        d="M9.112 8.262 5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 0 1 .894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 0 1 1.913.336l.34-1.59a5.207 5.207 0 0 0-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 0 0-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656 1.02-2.815.588 2.815zm-8.16-4.84-1.603 7.496H8.34l1.605-7.496z"
        transform="translate(1.2 1.2) scale(0.9)"
      />
    </svg>
  );
}

function MastercardCircles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 20" className={cn("h-4 w-6", className)} aria-hidden>
      <circle cx="12" cy="10" r="8" fill="#EB001B" />
      <circle cx="20" cy="10" r="8" fill="#F79E1B" />
    </svg>
  );
}

function AmexBox({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 20" className={cn("h-4 w-7", className)} aria-hidden>
      <rect width="32" height="20" rx="2" fill="#006FCF" />
      <text x="16" y="13.5" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="ui-sans-serif, system-ui">
        AMEX
      </text>
    </svg>
  );
}

function BankMark() {
  return (
    <svg viewBox="0 0 36 36" className="h-full w-full" fill="none" aria-hidden>
      <rect width="36" height="36" rx="8" fill="#0B3A6E" />
      <path d="M6 14.5 18 8l12 6.5V16H6z" fill="#F5C451" />
      <rect x="8" y="16" width="3.2" height="10" rx="0.6" fill="#E8EEF7" />
      <rect x="13.4" y="16" width="3.2" height="10" rx="0.6" fill="#E8EEF7" />
      <rect x="18.8" y="16" width="3.2" height="10" rx="0.6" fill="#E8EEF7" />
      <rect x="24.2" y="16" width="3.2" height="10" rx="0.6" fill="#E8EEF7" />
      <rect x="6.5" y="26" width="23" height="2.4" rx="0.6" fill="#F5C451" />
    </svg>
  );
}

function InteracMark() {
  return (
    <svg viewBox="0 0 36 36" className="h-full w-full" fill="none" aria-hidden>
      <rect width="36" height="36" rx="8" fill="#FFD100" />
      <path d="M7.5 10.5 16 18 7.5 25.5V10.5Z" fill="#111" />
      <path d="M15.5 10.5 24 18 15.5 25.5V10.5Z" fill="#111" />
      <text
        x="18"
        y="32"
        textAnchor="middle"
        fill="#111"
        fontSize="5.2"
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        Interac
      </text>
    </svg>
  );
}

function WiseMark() {
  return (
    <svg viewBox="0 0 36 36" className="h-full w-full" fill="none" aria-hidden>
      <rect width="36" height="36" rx="8" fill="#9FE870" />
      <g transform="translate(6 6)">
        <path
          fill="#163300"
          d="M6.488 7.469 0 15.05h11.585l1.301-3.576H7.922l3.033-3.507.01-.092L8.993 4.48h8.873l-6.878 18.925h4.706L24 .595H2.543l3.945 6.874Z"
        />
      </g>
    </svg>
  );
}

function MobileMark() {
  return (
    <svg viewBox="0 0 36 36" className="h-full w-full" fill="none" aria-hidden>
      <rect width="36" height="36" rx="8" fill="#00A651" />
      <rect x="11" y="6" width="14" height="24" rx="3" fill="#F4FFF8" />
      <rect x="13" y="9" width="10" height="14" rx="1" fill="#C8F0D4" />
      <circle cx="18" cy="26.5" r="1.4" fill="#00A651" />
    </svg>
  );
}
