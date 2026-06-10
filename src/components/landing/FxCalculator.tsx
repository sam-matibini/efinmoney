import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowDownUp, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type FiatRow = { from: string; to: string; price: number; change24h: number };
type MarketResponse = { fiat: FiatRow[]; crypto: unknown[]; fetched_at: string };

const SEND_CCYS = ["CAD", "USD", "GBP", "EUR"] as const;
const RECEIVE_CCYS = [
  "NGN", "KES", "GHS", "ZMW", "UGX", "TZS", "RWF", "ZAR",
  "XOF", "XAF", "USD", "CAD", "EUR", "GBP",
] as const;

const PAYOUT_CCYS = new Set(["NGN", "KES", "GHS", "ZMW", "UGX", "TZS", "RWF", "ZAR", "XOF", "XAF"]);

const CCY_TO_CC: Record<string, string> = {
  USD: "us", CAD: "ca", GBP: "gb", EUR: "eu",
  NGN: "ng", KES: "ke", GHS: "gh", ZMW: "zm", UGX: "ug", TZS: "tz",
  RWF: "rw", ZAR: "za", XOF: "sn", XAF: "cm",
};

const FEE_RATE = 0.005; // mirrors fx-engine

const formatMoney = (n: number, ccy: string) => {
  const decimals = n >= 1000 ? 2 : n >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n) + " " + ccy;
};

const Flag = ({ ccy }: { ccy: string }) => {
  const cc = CCY_TO_CC[ccy];
  if (!cc) return <span className="inline-block w-5 h-[15px] rounded-[2px] bg-white/20" />;
  return (
    <img
      src={`https://flagcdn.com/20x15/${cc}.png`}
      srcSet={`https://flagcdn.com/40x30/${cc}.png 2x`}
      width={20}
      height={15}
      alt={ccy}
      loading="lazy"
      className="inline-block rounded-[2px] ring-1 ring-white/15"
    />
  );
};

/** Build USD-pivot map: ccy → USD multiplier (i.e., 1 ccy = x USD). */
const buildUsdMap = (rows: FiatRow[]): Map<string, number> => {
  const m = new Map<string, number>();
  m.set("USD", 1);
  for (const r of rows) {
    if (r.to === "USD" && !m.has(r.from)) m.set(r.from, Number(r.price));
    if (r.from === "USD" && !m.has(r.to) && Number(r.price) > 0) m.set(r.to, 1 / Number(r.price));
  }
  // second pass for any chained pairs (e.g. CAD→NGN) using already-known USD anchors
  for (const r of rows) {
    if (!m.has(r.to) && m.has(r.from) && Number(r.price) > 0) {
      // 1 from = price to  →  1 to = (1/price) from = (1/price)*usd(from)
      m.set(r.to, m.get(r.from)! / Number(r.price));
    }
    if (!m.has(r.from) && m.has(r.to) && Number(r.price) > 0) {
      m.set(r.from, m.get(r.to)! * Number(r.price));
    }
  }
  return m;
};

const FxCalculator = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [from, setFrom] = useState<string>("CAD");
  const [to, setTo] = useState<string>("NGN");
  const [amount, setAmount] = useState<string>("1000");
  const [tick, setTick] = useState(0);
  const fetchedAtRef = useRef<number>(Date.now());

  const { data, isLoading } = useQuery({
    queryKey: ["market-rates-fx-calc"],
    queryFn: async (): Promise<MarketResponse> => {
      const { data, error } = await supabase.functions.invoke("market-rates");
      if (error) throw error;
      fetchedAtRef.current = Date.now();
      return data as MarketResponse;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // "updated Xs ago" tick
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const usdMap = useMemo(() => buildUsdMap(data?.fiat ?? []), [data]);

  const rate = useMemo(() => {
    if (from === to) return 1;
    const fUsd = usdMap.get(from);
    const tUsd = usdMap.get(to);
    if (!fUsd || !tUsd) return null;
    return fUsd / tUsd;
  }, [from, to, usdMap]);

  const numericAmount = Number(amount.replace(/,/g, "")) || 0;
  const receive = rate ? numericAmount * rate * (1 - FEE_RATE) : 0;
  const secondsAgo = Math.max(0, Math.floor((Date.now() - fetchedAtRef.current) / 1000));
  // tick is referenced to keep secondsAgo fresh
  void tick;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const goNext = (mode: "signup" | "signin" | "direct") => {
    const target = PAYOUT_CCYS.has(to) ? "/send" : "/exchange";
    const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${encodeURIComponent(String(numericAmount))}`;
    const dest = target + qs;
    // remember intent so post-auth destination pages can prefill
    try {
      sessionStorage.setItem(
        "efm_fx_intent",
        JSON.stringify({ from, to, amount: numericAmount, at: Date.now() }),
      );
    } catch { /* ignore */ }
    if (user || mode === "direct") {
      navigate(dest);
      return;
    }
    const authPath = `/auth?mode=${mode}&redirect=${encodeURIComponent(dest)}`;
    navigate(authPath);
  };

  return (
    <div className="relative w-full max-w-md mx-auto lg:mx-0">
      <div className="absolute -inset-1 rounded-[28px] bg-gradient-to-br from-[hsl(var(--accent-amber)/0.35)] via-[hsl(var(--brand-500)/0.25)] to-transparent blur-2xl pointer-events-none" />
      <div className="relative rounded-3xl bg-[hsl(248_60%_8%)]/95 backdrop-blur-xl ring-1 ring-white/15 shadow-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
            Live FX calculator
          </div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {isLoading ? "Loading…" : `Updated ${secondsAgo}s ago`}
          </div>
        </div>

        {/* You send */}
        <CurrencyRow
          label="You send"
          amount={amount}
          editable
          onAmountChange={setAmount}
          currency={from}
          onCurrencyChange={setFrom}
          options={SEND_CCYS as unknown as string[]}
        />

        <div className="my-2 flex justify-center">
          <button
            type="button"
            onClick={swap}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/20 text-white grid place-items-center transition"
            aria-label="Swap currencies"
          >
            <ArrowDownUp className="w-4 h-4" />
          </button>
        </div>

        {/* Recipient gets */}
        <CurrencyRow
          label="Recipient gets"
          amount={isLoading ? "…" : rate ? formatNumber(receive) : "—"}
          editable={false}
          currency={to}
          onCurrencyChange={setTo}
          options={RECEIVE_CCYS as unknown as string[]}
        />

        {/* Rate strip */}
        <div className="mt-4 rounded-xl bg-white/5 ring-1 ring-white/10 px-3.5 py-2.5 text-[11.5px] text-white/75 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-white">
            1 {from} = {rate ? formatMoney(rate, to).replace(" " + to, "") : "—"} {to}
          </span>
          <span className="text-white/40">·</span>
          <span>Fee {(FEE_RATE * 100).toFixed(1)}%</span>
          <span className="text-white/40">·</span>
          <span>Mid-market</span>
        </div>

        {/* CTAs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => goNext(user ? "direct" : "signup")}
            disabled={!rate || numericAmount <= 0}
            className="group inline-flex items-center justify-center gap-2 h-12 rounded-full bg-[hsl(var(--accent-amber))] hover:brightness-110 text-[hsl(var(--brand-900))] font-bold text-sm shadow-cta-amber transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {user ? "Continue" : "Sign up & send"}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
          {!user && (
            <button
              type="button"
              onClick={() => goNext("signin")}
              className="inline-flex items-center justify-center h-12 rounded-full bg-white/10 hover:bg-white/15 ring-1 ring-white/20 text-white font-bold text-sm transition"
            >
              Sign in
            </button>
          )}
        </div>

        <p className="mt-3 text-[10.5px] leading-relaxed text-white/45">
          Indicative mid-market rate. Final tradable rate is locked at quote (60 s) after sign in.
        </p>
      </div>
    </div>
  );
};

const formatNumber = (n: number) => {
  const decimals = n >= 1000 ? 2 : n >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
};

const CurrencyRow = ({
  label, amount, editable, onAmountChange, currency, onCurrencyChange, options,
}: {
  label: string;
  amount: string;
  editable: boolean;
  onAmountChange?: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  options: string[];
}) => (
  <div className="rounded-2xl bg-white/[0.06] ring-1 ring-white/10 px-4 py-3">
    <div className="text-[10.5px] uppercase tracking-[0.18em] font-semibold text-white/55 mb-1.5">
      {label}
    </div>
    <div className="flex items-center gap-3">
      {editable ? (
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => onAmountChange?.(e.target.value.replace(/[^0-9.,]/g, ""))}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-2xl sm:text-3xl font-black text-white tabular-nums placeholder:text-white/30"
          placeholder="0.00"
        />
      ) : (
        <div className="flex-1 min-w-0 text-2xl sm:text-3xl font-black text-white tabular-nums truncate">
          {amount === "…" ? <Loader2 className="w-5 h-5 animate-spin text-white/60" /> : amount}
        </div>
      )}
      <div className="relative">
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="appearance-none pl-9 pr-7 h-11 rounded-xl bg-white/10 hover:bg-white/15 ring-1 ring-white/15 text-white text-sm font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent-amber))]"
        >
          {options.map((o) => (
            <option key={o} value={o} className="bg-[hsl(248_60%_10%)]">{o}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          <Flag ccy={currency} />
        </span>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/60 text-xs">▾</span>
      </div>
    </div>
  </div>
);

export default FxCalculator;
