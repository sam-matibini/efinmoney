import { Link } from "react-router-dom";
import { useTransfers, type Transfer } from "@/hooks/useTransfers";

type Brand = { name: string; src: string };

const BRANDS: Record<string, Brand> = {
  mpesa: { name: "M-PESA", src: "/payout-logos/mpesa.svg" },
  mtn: { name: "MTN", src: "/payout-logos/mtn.svg" },
  airtel: { name: "airtel", src: "/payout-logos/airtel.svg" },
  vodafone: { name: "vodafone", src: "/payout-logos/vodafone.svg" },
  airteltigo: { name: "AT", src: "/payout-logos/airteltigo.png" },
  zamtel: { name: "Zamtel", src: "/payout-logos/zamtel.png" },
  opay: { name: "OPay", src: "/payout-logos/opay.png" },
  moniepoint: { name: "Moniepoint", src: "/payout-logos/moniepoint.svg" },
  paga: { name: "Paga", src: "/payout-logos/paga.png" },
  palmpay: { name: "PalmPay", src: "/payout-logos/palmpay.png" },
  access: { name: "Access Bank", src: "/payout-logos/access.png" },
  firstbank: { name: "FirstBank", src: "/payout-logos/firstbank.png" },
  zenith: { name: "Zenith Bank", src: "/payout-logos/zenith.svg" },
  gtbank: { name: "GTBank", src: "/payout-logos/gtbank.svg" },
  uba: { name: "UBA", src: "/payout-logos/uba.png" },
  equity: { name: "Equity", src: "/payout-logos/equity.png" },
  kcb: { name: "KCB", src: "/payout-logos/kcb.png" },
  ecobank: { name: "Ecobank", src: "/payout-logos/ecobank.svg" },
  interac: { name: "Interac", src: "/payout-logos/interac.svg" },
  rbc: { name: "RBC", src: "/payout-logos/rbc.svg" },
  td: { name: "TD", src: "/payout-logos/td.svg" },
  scotiabank: { name: "Scotiabank", src: "/payout-logos/scotiabank.svg" },
  visa: { name: "Visa", src: "/payout-logos/visa.svg" },
  mastercard: { name: "Mastercard", src: "/payout-logos/mastercard.svg" },
};

const RAILS: Record<string, { wallets: string[]; banks: string[] }> = {
  NGN: {
    wallets: ["moniepoint", "opay", "paga", "palmpay"],
    banks: ["access", "firstbank", "zenith", "gtbank", "uba"],
  },
  GHS: { wallets: ["mtn", "vodafone", "airteltigo"], banks: ["ecobank"] },
  ZMW: { wallets: ["mtn", "airtel", "zamtel"], banks: [] },
  KES: { wallets: ["mpesa"], banks: ["equity", "kcb"] },
  CAD: { wallets: ["interac"], banks: ["rbc", "td", "scotiabank"] },
  USD: { wallets: ["visa", "mastercard"], banks: [] },
};

function LogoTile({ id }: { id: string }) {
  const brand = BRANDS[id];
  if (!brand) return null;
  return (
    <span
      title={brand.name}
      className="inline-flex h-11 min-w-[4.75rem] items-center justify-center rounded-lg bg-white px-2 shadow-sm ring-1 ring-black/10"
    >
      <img src={brand.src} alt={brand.name} className="h-7 max-w-[6.5rem] object-contain" />
    </span>
  );
}

function statusLabel(status: Transfer["status"]): string {
  if (status === "completed") return "Delivered";
  if (status === "failed" || status === "reversed" || status === "expired") return "Failed";
  return "In progress";
}

export function SendCorridorStrip({ currency }: { currency: string }) {
  const rail = RAILS[currency.toUpperCase()] ?? { wallets: ["Mobile money"], banks: ["Bank deposit"] };
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <p className="text-center text-base font-semibold text-foreground">Rapid, secure transfer</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="mb-2 font-medium text-muted-foreground">
            {currency.toUpperCase() === "USD" ? "Cards" : currency.toUpperCase() === "CAD" ? "e-Transfer" : "Mobile wallets"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rail.wallets.map((id) => (
              <LogoTile key={id} id={id} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-medium text-muted-foreground">Bank accounts {currency.toUpperCase()}</p>
          <div className="flex flex-wrap gap-1.5">
            {rail.banks.length === 0 ? (
              <span className="text-xs text-muted-foreground">Mobile money only</span>
            ) : rail.banks.map((id) => (
              <LogoTile key={id} id={id} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecentSends() {
  const { data: transfers = [], isLoading } = useTransfers(4);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <Link to="/transfers" className="text-sm font-medium text-primary">See all</Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading recent transfers…</p>
      ) : transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Transfers you send will show up here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {transfers.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{t.recipient_name}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.created_at.slice(0, 10)}</span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    {statusLabel(t.status)}
                  </span>
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">{Number(t.source_amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t.source_currency}</p>
                <p className="text-muted-foreground">{Number(t.target_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.target_currency}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
