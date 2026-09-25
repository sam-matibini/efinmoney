import { Link } from "react-router-dom";
import { useTransfers, type Transfer } from "@/hooks/useTransfers";

type Brand = { name: string; bg: string; fg: string; mark: string };

const BRANDS: Record<string, Brand> = {
  mpesa: { name: "M-PESA", bg: "#4CAF00", fg: "#fff", mark: "M-PESA" },
  mtn: { name: "MTN", bg: "#FFCC00", fg: "#111", mark: "MTN" },
  airtel: { name: "airtel", bg: "#ED1C24", fg: "#fff", mark: "airtel" },
  vodafone: { name: "vodafone", bg: "#E60000", fg: "#fff", mark: "vodafone" },
  airteltigo: { name: "AirtelTigo", bg: "#ED1C24", fg: "#fff", mark: "at" },
  zamtel: { name: "Zamtel", bg: "#007A33", fg: "#fff", mark: "Zamtel" },
  opay: { name: "OPay", bg: "#00B15D", fg: "#fff", mark: "OPay" },
  moniepoint: { name: "Moniepoint", bg: "#0033A0", fg: "#fff", mark: "M" },
  paga: { name: "Paga", bg: "#0057FF", fg: "#fff", mark: "Paga" },
  palmpay: { name: "PalmPay", bg: "#6C2BD9", fg: "#fff", mark: "PalmPay" },
  access: { name: "Access", bg: "#F58220", fg: "#fff", mark: "access" },
  firstbank: { name: "FirstBank", bg: "#00205B", fg: "#F5C518", mark: "FirstBank" },
  zenith: { name: "Zenith", bg: "#E10600", fg: "#fff", mark: "Zenith" },
  gtbank: { name: "GTBank", bg: "#FF6600", fg: "#fff", mark: "GTBank" },
  uba: { name: "UBA", bg: "#E4002B", fg: "#fff", mark: "UBA" },
  equity: { name: "Equity", bg: "#8B1E3F", fg: "#fff", mark: "Equity" },
  kcb: { name: "KCB", bg: "#78BE20", fg: "#163A1A", mark: "KCB" },
  gcb: { name: "GCB", bg: "#0033A0", fg: "#fff", mark: "GCB" },
  ecobank: { name: "Ecobank", bg: "#0055A5", fg: "#fff", mark: "Ecobank" },
  interac: { name: "Interac", bg: "#FFD200", fg: "#111", mark: "INTERAC" },
  rbc: { name: "RBC", bg: "#0051A5", fg: "#FFD200", mark: "RBC" },
  td: { name: "TD", bg: "#008A00", fg: "#fff", mark: "TD" },
  scotiabank: { name: "Scotiabank", bg: "#EC111A", fg: "#fff", mark: "Scotia" },
  visa: { name: "Visa", bg: "#1A1F71", fg: "#fff", mark: "VISA" },
  mastercard: { name: "Mastercard", bg: "#fff", fg: "#111", mark: "●●" },
};

const RAILS: Record<string, { wallets: string[]; banks: string[] }> = {
  NGN: {
    wallets: ["moniepoint", "opay", "paga", "palmpay"],
    banks: ["access", "firstbank", "zenith", "gtbank", "uba"],
  },
  GHS: { wallets: ["mtn", "vodafone", "airteltigo"], banks: ["gcb", "ecobank"] },
  ZMW: { wallets: ["mtn", "airtel", "zamtel"], banks: [] },
  KES: { wallets: ["mpesa"], banks: ["equity", "kcb"] },
  CAD: { wallets: ["interac"], banks: ["rbc", "td", "scotiabank"] },
  USD: { wallets: ["visa", "mastercard"], banks: [] },
};

function LogoTile({ id }: { id: string }) {
  const brand = BRANDS[id];
  if (!brand) return null;
  const light = brand.bg === "#fff" || brand.bg === "#FFCC00" || brand.bg === "#FFD200";
  return (
    <span
      title={brand.name}
      className="inline-flex h-10 min-w-[4.75rem] items-center justify-center rounded-lg px-2.5 shadow-sm ring-1 ring-black/10"
      style={{ background: brand.bg, color: brand.fg }}
    >
      {id === "mastercard" ? (
        <span className="relative inline-flex h-5 w-8" aria-label="Mastercard">
          <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-[#EB001B]" />
          <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-[#F79E1B] mix-blend-multiply" />
        </span>
      ) : (
        <span className={`truncate text-[11px] font-black tracking-tight ${light ? "" : "drop-shadow-sm"}`}>
          {brand.mark}
        </span>
      )}
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
