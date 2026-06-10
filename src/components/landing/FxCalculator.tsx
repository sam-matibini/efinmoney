import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowDownUp, ArrowRight, Check, ChevronDown, Loader2, Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { WORLD_CURRENCIES, WORLD_CURRENCY_MAP } from "@/lib/worldCurrencies";

type FiatRow = { from: string; to: string; price: number; change24h: number };
type MarketResponse = { fiat: FiatRow[]; crypto: unknown[]; fetched_at: string };

const PAYOUT_CCYS = new Set(["NGN", "KES", "GHS", "ZMW", "UGX", "TZS", "RWF", "ZAR", "XOF", "XAF"]);

const FEE_RATE = 0.005; // eFinMoney
const BANK_MARGIN = 0.035; // typical bank/PayPal hidden FX margin baseline

const Flag = ({ code, size = 20 }: { code: string; size?: number }) => {
  const cc = WORLD_CURRENCY_MAP[code]?.cc;
  if (!cc) return <span className="inline-block rounded-[2px] bg-white/20" style={{ width: size, height: size * 0.75 }} />;
  return (
    <img
      src={`https://flagcdn.com/${size * 2}x${size * 1.5}/${cc}.png`}
      width={size}
      height={size * 0.75}
      alt={code}
      loading="lazy"
      className="inline-block rounded-[2px] ring-1 ring-white/15 object-cover"
    />
  );
};

const buildUsdMap = (rows: FiatRow[]): Map<string, number> => {
  const m = new Map<string, number>();
  m.set("USD", 1);
  for (const r of rows) {
    if (r.to === "USD" && !m.has(r.from)) m.set(r.from, Number(r.price));
    if (r.from === "USD" && !m.has(r.to) && Number(r.price) > 0) m.set(r.to, 1 / Number(r.price));
  }
  for (const r of rows) {
    if (!m.has(r.to) && m.has(r.from) && Number(r.price) > 0) m.set(r.to, m.get(r.from)! / Number(r.price));
    if (!m.has(r.from) && m.has(r.to) && Number(r.price) > 0) m.set(r.from, m.get(r.to)! * Number(r.price));
  }
  return m;
};

const fmt = (n: number) => {
  if (!isFinite(n)) return "—";
  const decimals = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
};

const parseAmount = (s: string): number => {
  const n = Number(String(s).replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};

const FxCalculator = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [from, setFrom] = useState<string>("CAD");
  const [to, setTo] = useState<string>("NGN");
  const [sendAmt, setSendAmt] = useState<string>("1000");
  const [recvAmt, setRecvAmt] = useState<string>("");
  const [lastEdited, setLastEdited] = useState<"send" | "receive">("send");
  const [, setTick] = useState(0);
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

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const usdMap = useMemo(() => buildUsdMap(data?.fiat ?? []), [data]);

  const midRate = useMemo<number | null>(() => {
    if (from === to) return 1;
    const fUsd = usdMap.get(from);
    const tUsd = usdMap.get(to);
    if (!fUsd || !tUsd) return null;
    return fUsd / tUsd;
  }, [from, to, usdMap]);

  const effectiveRate = midRate ? midRate * (1 - FEE_RATE) : null;
  const bankRate = midRate ? midRate * (1 - BANK_MARGIN) : null;

  // Recompute the non-edited side whenever rate / inputs / pair change
  useEffect(() => {
    if (!effectiveRate) return;
    if (lastEdited === "send") {
      const s = parseAmount(sendAmt);
      setRecvAmt(s > 0 ? fmt(s * effectiveRate) : "");
    } else {
      const r = parseAmount(recvAmt);
      setSendAmt(r > 0 ? fmt(r / effectiveRate) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRate, from, to]);

  const onSendChange = (v: string) => {
    const clean = v.replace(/[^0-9.,]/g, "");
    setSendAmt(clean);
    setLastEdited("send");
    if (!effectiveRate) return;
    const s = parseAmount(clean);
    setRecvAmt(s > 0 ? fmt(s * effectiveRate) : "");
  };
  const onRecvChange = (v: string) => {
    const clean = v.replace(/[^0-9.,]/g, "");
    setRecvAmt(clean);
    setLastEdited("receive");
    if (!effectiveRate) return;
    const r = parseAmount(clean);
    setSendAmt(r > 0 ? fmt(r / effectiveRate) : "");
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const secondsAgo = Math.max(0, Math.floor((Date.now() - fetchedAtRef.current) / 1000));

  const sendNumeric = parseAmount(sendAmt);
  const recvNumeric = parseAmount(recvAmt);
  const bankReceive = bankRate ? sendNumeric * bankRate : 0;
  const savings = recvNumeric - bankReceive; // in `to` currency
  // Convert savings back to send currency for headline
  const savingsInSend = midRate && midRate > 0 ? savings / midRate : 0;
  const savingsPct = bankReceive > 0 ? ((recvNumeric - bankReceive) / bankReceive) * 100 : 0;

  const goNext = (mode: "signup" | "signin" | "direct") => {
    const target = PAYOUT_CCYS.has(to) ? "/send" : "/exchange";
    const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${encodeURIComponent(String(sendNumeric))}`;
    const dest = target + qs;
    try {
      sessionStorage.setItem("efm_fx_intent", JSON.stringify({ from, to, amount: sendNumeric, at: Date.now() }));
    } catch { /* ignore */ }
    if (user || mode === "direct") return navigate(dest);
    navigate(`/auth?mode=${mode}&redirect=${encodeURIComponent(dest)}`);
  };

  const rateUnavailable = !isLoading && !midRate;

  return (
    <div className="relative w-full max-w-[340px] mx-auto lg:mx-0">
      <div className="absolute -inset-1 rounded-[24px] bg-gradient-to-br from-[hsl(var(--accent-amber)/0.35)] via-[hsl(var(--brand-500)/0.25)] to-transparent blur-2xl pointer-events-none" />
      <div className="relative rounded-2xl bg-[hsl(248_60%_8%)]/95 backdrop-blur-xl ring-1 ring-white/15 shadow-2xl p-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">Live FX calculator</div>
          <div className="inline-flex items-center gap-1.5 text-[9.5px] font-semibold text-white/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {isLoading ? "Loading…" : `${secondsAgo}s ago`}
          </div>
        </div>

        <AmountRow
          label="You send"
          value={sendAmt}
          onChange={onSendChange}
          currency={from}
          onCurrencyChange={setFrom}
          loading={isLoading}
        />

        <div className="my-1.5 flex justify-center">
          <button
            type="button"
            onClick={swap}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 ring-1 ring-white/20 text-white grid place-items-center transition"
            aria-label="Swap currencies"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
          </button>
        </div>

        <AmountRow
          label="Recipient gets"
          value={recvAmt}
          onChange={onRecvChange}
          currency={to}
          onCurrencyChange={setTo}
          loading={isLoading}
          highlight
        />

        {/* Comparison strip */}
        <div className="mt-3 rounded-xl bg-gradient-to-br from-[hsl(var(--accent-amber)/0.12)] to-white/[0.03] ring-1 ring-[hsl(var(--accent-amber)/0.25)] p-2.5">
          {rateUnavailable ? (
            <div className="text-[12px] text-white/70">Rate unavailable for this pair — try another currency.</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--accent-amber))]">
                  <Sparkles className="w-3.5 h-3.5" />
                  You save with eFinMoney
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-white tabular-nums leading-none">
                    {savingsInSend > 0 ? `+${fmt(savingsInSend)} ${from}` : "—"}
                  </div>
                  {savingsPct > 0 && (
                    <div className="text-[10px] font-bold text-emerald-400 tabular-nums">+{savingsPct.toFixed(1)}%</div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-[11.5px]">
                <Row
                  label="eFinMoney"
                  rate={midRate ? `1 ${from} = ${fmt(midRate)} ${to}` : "—"}
                  fee="0.5% fee"
                  good
                />
                <Row
                  label="Typical bank"
                  rate={bankRate ? `1 ${from} = ${fmt(bankRate)} ${to}` : "—"}
                  fee="~3.5% hidden margin"
                />
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge>Mid-market rate</Badge>
                <Badge>No hidden fees</Badge>
                <Badge>60s rate lock</Badge>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => goNext(user ? "direct" : "signup")}
            disabled={rateUnavailable || sendNumeric <= 0}
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

const Row = ({ label, rate, fee, good }: { label: string; rate: string; fee: string; good?: boolean }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-1.5 min-w-0">
      {good ? (
        <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center shrink-0">
          <Check className="w-2.5 h-2.5" strokeWidth={3} />
        </span>
      ) : (
        <span className="w-4 h-4 shrink-0" />
      )}
      <span className={good ? "font-bold text-white" : "text-white/60"}>{label}</span>
    </div>
    <div className="text-right">
      <div className={`tabular-nums ${good ? "text-white font-semibold" : "text-white/70"}`}>{rate}</div>
      <div className={`text-[10px] ${good ? "text-emerald-400 font-semibold" : "text-white/50"}`}>{fee}</div>
    </div>
  </div>
);

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/75 bg-white/8 ring-1 ring-white/15 rounded-full px-2 py-0.5">
    <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3} />
    {children}
  </span>
);

const AmountRow = ({
  label, value, onChange, currency, onCurrencyChange, loading, highlight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  loading?: boolean;
  highlight?: boolean;
}) => (
  <div className={`rounded-2xl px-4 py-3 ring-1 ${highlight ? "bg-white/[0.08] ring-white/15" : "bg-white/[0.06] ring-white/10"}`}>
    <div className="text-[10.5px] uppercase tracking-[0.18em] font-semibold text-white/55 mb-1.5">{label}</div>
    <div className="flex items-center gap-3">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={loading ? "…" : "0.00"}
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-2xl sm:text-3xl font-black text-white tabular-nums placeholder:text-white/30"
      />
      <CurrencyPicker value={currency} onChange={onCurrencyChange} />
    </div>
  </div>
);

const CurrencyPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const cur = WORLD_CURRENCY_MAP[value];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 pl-2 pr-2.5 h-11 rounded-xl bg-white/10 hover:bg-white/15 ring-1 ring-white/15 text-white text-sm font-bold transition"
        >
          <Flag code={value} />
          <span>{value}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[280px] p-0 bg-[hsl(248_60%_10%)] border-white/15 text-white"
      >
        <Command className="bg-transparent">
          <div className="flex items-center gap-2 px-3 border-b border-white/10">
            <Search className="w-4 h-4 text-white/50" />
            <CommandInput
              placeholder="Search currency or country…"
              className="bg-transparent text-white placeholder:text-white/40 h-10"
            />
          </div>
          <CommandList className="max-h-72">
            <CommandEmpty className="py-6 text-center text-sm text-white/50">No match.</CommandEmpty>
            <CommandGroup>
              {WORLD_CURRENCIES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.name} ${c.country}`}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2.5 cursor-pointer text-white aria-selected:bg-white/10"
                >
                  <Flag code={c.code} />
                  <span className="font-bold w-12 tabular-nums">{c.code}</span>
                  <span className="flex-1 min-w-0 truncate text-white/80">{c.name}</span>
                  <span className="text-[10px] text-white/50 truncate max-w-[80px]">{c.country}</span>
                  {value === c.code && <Check className="w-4 h-4 text-emerald-400" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default FxCalculator;
