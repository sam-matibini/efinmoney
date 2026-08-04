import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowDownUp, ArrowRight, Check, ChevronDown, Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePricingConfig } from "@/hooks/usePricingConfig";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { WORLD_CURRENCIES, WORLD_CURRENCY_MAP } from "@/lib/worldCurrencies";
import { getNombaExchangeRate, isNgnPair } from "@/lib/nombaNigeria";
import {
  BENCHMARK_A_FLAT_FEE_USD,
  BENCHMARK_A_MARGIN,
  BENCHMARK_B_FLAT_FEE_USD,
  BENCHMARK_B_MARGIN,
  EFIN_FLAT_FEE_USD,
  buildUsdMap,
  fmt,
  midRateFromUsdMap,
  parseAmount,
  formatAmountInput,
  quoteTransferRecipient,
  quoteTransferSend,
  type MarketResponse,
} from "@/components/fx/liveFxUtils";

export type LiveFxCalculatorProps = {
  variant?: "landing" | "app";
  className?: string;
  defaultFrom?: string;
  defaultTo?: string;
  defaultSendAmount?: string;
  /** Controlled pair (app / send page). */
  from?: string;
  to?: string;
  sendAmount?: string;
  onFromChange?: (code: string) => void;
  onToChange?: (code: string) => void;
  onSendAmountChange?: (value: string, numeric: number) => void;
  onRecvAmountChange?: (value: string, numeric: number) => void;
  /** Limit currency pickers (e.g. user wallets). */
  fromCurrencyFilter?: string[];
  toCurrencyFilter?: string[];
  /** Codes that should appear at the top of the picker under a "Popular" group. */
  priorityCodes?: readonly string[];
  /** Override quote math with app pricing (send page). */
  quoteRecipient?: (sendInFrom: number) => number;
  quoteSend?: (recvInTo: number) => number;
  displayRate?: number | null;
  feeLabel?: string;
  /** Overrides the small fee line under the send input. */
  feeNote?: string;
  walletBalance?: number | null;
  walletSymbol?: string;
  showComparison?: boolean;
  showDisclaimer?: boolean;
  showActions?: boolean;
  continueLabel?: string;
  onContinue?: (payload: { from: string; to: string; sendAmount: number; recvAmount: number }) => void;
  continueDisabled?: boolean;
  footer?: React.ReactNode;
  /** Tighter layout for dashboard modal — no outer blur bleed, no scrollbars. */
  embedded?: boolean;
  /** Sendwave-style single row: You send | They receive + currency, rate/fee caption below. */
  pairLayout?: boolean;
};

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

const LiveFxCalculator = ({
  variant = "landing",
  className = "",
  defaultFrom = "CAD",
  defaultTo = "NGN",
  defaultSendAmount = "1000",
  from: controlledFrom,
  to: controlledTo,
  sendAmount: controlledSend,
  onFromChange,
  onToChange,
  onSendAmountChange,
  onRecvAmountChange,
  fromCurrencyFilter,
  toCurrencyFilter,
  priorityCodes,
  quoteRecipient: quoteRecipientOverride,
  quoteSend: quoteSendOverride,
  displayRate,
  feeLabel,
  feeNote,
  walletBalance,
  walletSymbol,
  showComparison = true,
  showDisclaimer = true,
  showActions,
  continueLabel,
  onContinue,
  continueDisabled,
  footer,
  embedded = false,
  pairLayout = false,
}: LiveFxCalculatorProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: pricing } = usePricingConfig();
  const isApp = variant === "app";

  const [internalFrom, setInternalFrom] = useState(defaultFrom);
  const [internalTo, setInternalTo] = useState(defaultTo);
  const [sendAmt, setSendAmt] = useState(() => formatAmountInput(defaultSendAmount));
  const [recvAmt, setRecvAmt] = useState("");
  const [lastEdited, setLastEdited] = useState<"send" | "receive">("send");
  const [, setTick] = useState(0);
  const fetchedAtRef = useRef<number>(Date.now());

  const from = controlledFrom ?? internalFrom;
  const to = controlledTo ?? internalTo;
  const sendAmtDisplay = controlledSend ?? sendAmt;
  const sendAmtFormatted = formatAmountInput(sendAmtDisplay);

  const setFrom = (code: string) => {
    if (controlledFrom === undefined) setInternalFrom(code);
    onFromChange?.(code);
  };
  const setTo = (code: string) => {
    if (controlledTo === undefined) setInternalTo(code);
    onToChange?.(code);
  };

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

  const { data: nombaQuote } = useQuery({
    queryKey: ["nomba-fx-calc", from, to],
    queryFn: () => getNombaExchangeRate(from, to),
    enabled: from !== to && isNgnPair(from, to) && !(displayRate != null && displayRate > 0),
    staleTime: 60_000,
  });

  const usdMapEffective = useMemo(() => buildUsdMap(data?.fiat ?? [], "price"), [data]);
  const usdMapMarket = useMemo(() => buildUsdMap(data?.fiat ?? [], "market_price"), [data]);
  const marketRate = useMemo(() => midRateFromUsdMap(from, to, usdMapEffective), [from, to, usdMapEffective]);
  const marketMidRate = useMemo(() => midRateFromUsdMap(from, to, usdMapMarket), [from, to, usdMapMarket]);

  /** Rate used for quotes — parent DB rate wins, then Nomba NGN, then live market cross-rate. */
  const resolvedQuoteRate = useMemo(() => {
    if (displayRate != null && displayRate > 0) return displayRate;
    if (nombaQuote?.effective_rate && nombaQuote.effective_rate > 0) return nombaQuote.effective_rate;
    if (marketRate != null && marketRate > 0) return marketRate;
    return null;
  }, [displayRate, nombaQuote?.effective_rate, marketRate]);
  const usingNombaRate = !displayRate && !!nombaQuote?.effective_rate;

  const flatFeeInFrom = (usdFee: number): number => {
    if (!usdFee) return 0;
    const fUsd = usdMapEffective.get(from);
    if (!fUsd || fUsd <= 0) return usdFee;
    return usdFee / fUsd;
  };

  const transferFlatFee =
    pricing?.transfer_base_fee != null
      ? pricing.transfer_base_fee
      : flatFeeInFrom(EFIN_FLAT_FEE_USD);

  const resolvedFeeLabel =
    feeLabel ??
    (pricing?.transfer_base_fee != null
      ? `${from} ${fmt(pricing.transfer_base_fee)} flat fee`
      : "0.8% + $0.99");

  const defaultQuoteRecipient = (sendInFrom: number, margin: number, flatUsd: number, rate: number): number => {
    if (!rate || sendInFrom <= 0) return 0;
    if (from === to) {
      return Math.max(0, sendInFrom * (1 - margin));
    }
    const fee = flatFeeInFrom(flatUsd);
    const net = Math.max(0, sendInFrom - fee);
    return net * rate * (1 - margin);
  };

  const defaultEfinRecipient = (sendInFrom: number): number => {
    if (from === to) return Math.max(0, sendInFrom);
    return quoteTransferRecipient(sendInFrom, resolvedQuoteRate ?? 0, transferFlatFee);
  };

  const defaultEfinSend = (recvInTo: number): number => {
    if (from === to) return recvInTo;
    return quoteTransferSend(recvInTo, resolvedQuoteRate ?? 0, transferFlatFee);
  };

  const efinRecipient = (s: number) => {
    if (quoteRecipientOverride) {
      const overridden = quoteRecipientOverride(s);
      if (overridden > 0 || s <= 0) return overridden;
      if (resolvedQuoteRate && resolvedQuoteRate > 0) {
        return quoteTransferRecipient(s, resolvedQuoteRate, transferFlatFee);
      }
      return overridden;
    }
    return defaultEfinRecipient(s);
  };
  const efinSend = (r: number) => {
    if (quoteSendOverride) {
      const overridden = quoteSendOverride(r);
      if (overridden > 0 || r <= 0) return overridden;
      if (resolvedQuoteRate && resolvedQuoteRate > 0) {
        return quoteTransferSend(r, resolvedQuoteRate, transferFlatFee);
      }
      return overridden;
    }
    return defaultEfinSend(r);
  };

  const syncFromSend = (sendStr: string) => {
    const s = parseAmount(sendStr);
    const next = s > 0 ? fmt(efinRecipient(s)) : "";
    setRecvAmt(next);
    onRecvAmountChange?.(next, parseAmount(next));
  };

  const syncFromRecv = (recvStr: string) => {
    const r = parseAmount(recvStr);
    const sendVal = r > 0 ? efinSend(r) : 0;
    const next = sendVal > 0 ? formatAmountInput(String(sendVal)) : "";
    if (controlledSend === undefined) setSendAmt(next);
    onSendAmountChange?.(next, parseAmount(next));
  };

  useEffect(() => {
    if (lastEdited !== "send") return;
    syncFromSend(sendAmtDisplay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedQuoteRate, transferFlatFee, from, to, sendAmtDisplay, quoteRecipientOverride, quoteSendOverride, displayRate]);

  const onSendChange = (v: string) => {
    const formatted = formatAmountInput(v);
    if (controlledSend === undefined) setSendAmt(formatted);
    setLastEdited("send");
    onSendAmountChange?.(formatted, parseAmount(formatted));
    syncFromSend(formatted);
  };

  const onRecvChange = (v: string) => {
    const formatted = formatAmountInput(v);
    setRecvAmt(formatted);
    setLastEdited("receive");
    onRecvAmountChange?.(formatted, parseAmount(formatted));
    syncFromRecv(formatted);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const secondsAgo = Math.max(0, Math.floor((Date.now() - fetchedAtRef.current) / 1000));
  const sendNumeric = parseAmount(sendAmtDisplay);
  const recvNumeric = parseAmount(recvAmt);

  const efinDisplayRate = resolvedQuoteRate;
  const marketMargin = Math.max(BENCHMARK_A_MARGIN, BENCHMARK_B_MARGIN);
  const marketDisplayRate = marketMidRate ? marketMidRate * (1 - marketMargin) : null;

  const benchARecv = defaultQuoteRecipient(sendNumeric, BENCHMARK_A_MARGIN, BENCHMARK_A_FLAT_FEE_USD, marketMidRate ?? 0);
  const benchBRecv = defaultQuoteRecipient(sendNumeric, BENCHMARK_B_MARGIN, BENCHMARK_B_FLAT_FEE_USD, marketMidRate ?? 0);
  const bestCompetitorRecv = Math.max(benchARecv, benchBRecv);
  const savingsInTo = recvNumeric - bestCompetitorRecv;
  const savingsInSend = marketMidRate && marketMidRate > 0 ? savingsInTo / marketMidRate : 0;
  const savingsPct = bestCompetitorRecv > 0 ? (savingsInTo / bestCompetitorRecv) * 100 : 0;

  const goNext = (mode: "signup" | "signin" | "direct") => {
    if (onContinue) {
      onContinue({ from, to, sendAmount: sendNumeric, recvAmount: recvNumeric });
      return;
    }
    const target = to !== from ? "/send" : "/exchange";
    const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${encodeURIComponent(String(sendNumeric))}`;
    const dest = target + qs;
    try {
      sessionStorage.setItem("efm_fx_intent", JSON.stringify({ from, to, amount: sendNumeric, at: Date.now() }));
    } catch { /* ignore */ }
    if (user || mode === "direct") return navigate(dest);
    navigate(`/auth?mode=${mode}&redirect=${encodeURIComponent(dest)}`);
  };

  const rateUnavailable = !isLoading && !resolvedQuoteRate && !quoteRecipientOverride;
  const actionsVisible = showActions ?? !isApp;
  const resolvedContinueLabel = continueLabel ?? (isApp ? "Continue" : user ? "Continue" : "Sign up & send");
  const appSurface = embedded || isApp;

  const shell = appSurface
    ? {
        card: "bg-card border border-border shadow-sm",
        title: "text-muted-foreground",
        meta: "text-muted-foreground",
        amountRow: "bg-muted/40 ring-border",
        amountRowHi: "bg-muted/60 ring-border",
        amountLabel: "text-muted-foreground",
        amountInput: "text-foreground placeholder:text-muted-foreground/60",
        walletHint: "text-muted-foreground",
        walletWarn: "text-amber-600 dark:text-amber-400",
        swapBtn: "bg-muted hover:bg-muted/80 ring-border text-foreground",
        compareBox: "bg-muted/30 ring-border",
        compareTitle: "text-foreground",
        compareMuted: "text-muted-foreground",
        rowGood: "font-bold text-foreground",
        rowMuted: "text-muted-foreground",
        rowRateGood: "font-semibold text-foreground",
        rowRateMuted: "text-muted-foreground",
        badge: "text-muted-foreground ring-border bg-muted/50",
        disclaimer: "text-muted-foreground",
        pickerBtn: "bg-background hover:bg-muted ring-border text-foreground",
        popover: "bg-popover border-border text-popover-foreground",
        popoverInput: "text-foreground placeholder:text-muted-foreground",
        popoverEmpty: "text-muted-foreground",
        popoverItem: "text-foreground aria-selected:bg-muted",
        popoverMuted: "text-muted-foreground",
      }
    : {
        card: "bg-[hsl(248_60%_8%)]/95 backdrop-blur-xl ring-1 ring-white/15 shadow-2xl",
        title: "text-white/70",
        meta: "text-white/60",
        amountRow: "bg-white/[0.06] ring-white/10",
        amountRowHi: "bg-white/[0.08] ring-white/15",
        amountLabel: "text-white/55",
        amountInput: "text-white placeholder:text-white/30",
        walletHint: "text-white/50",
        walletWarn: "text-amber-300/90",
        swapBtn: "bg-white/10 hover:bg-white/20 ring-white/20 text-white",
        compareBox: "bg-gradient-to-br from-[hsl(var(--accent-amber)/0.12)] to-white/[0.03] ring-[hsl(var(--accent-amber)/0.25)]",
        compareTitle: "text-white",
        compareMuted: "text-white/70",
        rowGood: "font-bold text-white",
        rowMuted: "text-white/60",
        rowRateGood: "font-semibold text-white",
        rowRateMuted: "text-white/70",
        badge: "text-white/75 ring-white/15 bg-white/8",
        disclaimer: "text-white/45",
        pickerBtn: "bg-white/10 hover:bg-white/15 ring-white/15 text-white",
        popover: "bg-[hsl(248_60%_10%)] border-white/15 text-white",
        popoverInput: "text-white placeholder:text-white/40",
        popoverEmpty: "text-white/50",
        popoverItem: "text-white aria-selected:bg-white/10",
        popoverMuted: "text-white/50",
      };

  if (pairLayout) {
    return (
      <div className={`w-full ${className}`}>
        <div className="grid grid-cols-[1fr_auto] items-stretch rounded-xl border border-border bg-background overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="px-3 py-2.5">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">You send</div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold text-muted-foreground">{from}</span>
                <input
                  inputMode="decimal"
                  value={sendAmtFormatted}
                  onChange={(e) => onSendChange(e.target.value)}
                  placeholder={isLoading ? "…" : "0.00"}
                  className="min-w-0 flex-1 border-0 bg-transparent text-lg font-bold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">They receive</div>
              <input
                inputMode="decimal"
                value={recvAmt}
                onChange={(e) => onRecvChange(e.target.value)}
                placeholder={isLoading ? "…" : "0.00"}
                className="w-full border-0 bg-transparent text-lg font-bold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
          <div className="flex items-center border-l border-border px-2">
            <CurrencyPicker
              value={to}
              onChange={setTo}
              currencyFilter={toCurrencyFilter}
              priorityCodes={priorityCodes}
              shell={shell}
            />
          </div>
        </div>

        <div className="mt-2 space-y-0.5 text-center text-xs text-muted-foreground">
          {rateUnavailable ? (
            <p>Rate unavailable for {from} → {to}</p>
          ) : (
            <p>Exchange Rate: 1 {from} = {efinDisplayRate ? fmt(efinDisplayRate) : "—"} {to}</p>
          )}
          <p>{feeNote ?? `Transfer fees: ${resolvedFeeLabel}`}</p>
          {walletBalance != null && (
            <p className={walletBalance <= 0 ? "text-destructive" : undefined}>
              Available: {walletSymbol ?? ""}{fmt(walletBalance)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full ${embedded || isApp ? "max-w-full" : "max-w-[340px] mx-auto"} ${className}`}
    >
      {!appSurface && !embedded && !isApp && (
        <div className="absolute -inset-1 rounded-[24px] bg-gradient-to-br from-[hsl(var(--accent-amber)/0.35)] via-[hsl(var(--brand-500)/0.25)] to-transparent blur-2xl pointer-events-none" />
      )}
      <div className={`relative overflow-hidden rounded-2xl ${shell.card} ${embedded ? "p-3.5" : "p-4"}`}>
        <div className="flex items-center justify-between mb-2.5">
          <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${shell.title}`}>Live FX calculator</div>
          <div className={`inline-flex items-center gap-1.5 text-[9.5px] font-semibold ${shell.meta}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {isLoading ? "Loading…" : `${secondsAgo}s ago`}
          </div>
        </div>

        <AmountRow
          label="You send"
          value={sendAmtFormatted}
          onChange={onSendChange}
          currency={from}
          onCurrencyChange={setFrom}
          loading={isLoading}
          currencyFilter={fromCurrencyFilter}
          priorityCodes={priorityCodes}
          compact={embedded}
          shell={shell}
        />
        {walletBalance != null && (
          <p className={`mt-1 px-1 ${walletBalance <= 0 ? shell.walletWarn : shell.walletHint} text-[10px]`}>
            Available: {walletSymbol ?? ""}{fmt(walletBalance)}
            {walletBalance <= 0 && sendNumeric > 0 ? " · Top up to send" : ""}
          </p>
        )}
        {appSurface && sendNumeric > 0 && (feeNote || transferFlatFee > 0) && (
          <p className={`mt-0.5 px-1 text-[10px] ${shell.walletHint}`}>
            {feeNote ?? `+${fmt(transferFlatFee)} ${from} fee added · total ${fmt(sendNumeric + transferFlatFee)} ${from}`}
          </p>
        )}

        <div className="my-1.5 flex justify-center">
          <button
            type="button"
            onClick={swap}
            className={`w-8 h-8 rounded-full ring-1 grid place-items-center transition ${shell.swapBtn}`}
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
          currencyFilter={toCurrencyFilter}
          priorityCodes={priorityCodes}
          compact={embedded}
          shell={shell}
        />

        {showComparison && (
          <div className={`mt-3 rounded-xl ring-1 p-2.5 ${shell.compareBox}`}>
            {rateUnavailable ? (
              <div className={`text-[12px] ${shell.compareMuted}`}>Rate unavailable for this pair — try another currency.</div>
            ) : (
              <>
                {!isApp && (
                  <div className="flex items-center justify-between mb-2">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--accent-amber))]">
                      <Sparkles className="w-3.5 h-3.5" />
                      You save vs. typical market rate
                    </div>
                    <div className="text-right">
                      <div className={`text-base font-black tabular-nums leading-none ${shell.compareTitle}`}>
                        {savingsInSend > 0 ? `+${fmt(savingsInSend)} ${from}` : "—"}
                      </div>
                      {savingsPct > 0 && (
                        <div className="text-[10px] font-bold text-emerald-400 tabular-nums">+{savingsPct.toFixed(1)}%</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 text-[11px]">
                  <Row
                    label="eFinMoney"
                    rate={efinDisplayRate ? `1 ${from} = ${fmt(efinDisplayRate)} ${to}` : "—"}
                    fee={resolvedFeeLabel}
                    good
                    compact={embedded || isApp}
                    shell={shell}
                  />
                  {!isApp && (
                    <Row
                      label="Typical market rate"
                      rate={marketDisplayRate ? `1 ${from} = ${fmt(marketDisplayRate)} ${to}` : "—"}
                      fee="~2.2% + fees"
                      shell={shell}
                    />
                  )}
                </div>

                <div className={`mt-2.5 flex flex-wrap gap-1 ${embedded ? "gap-1" : "gap-1.5"}`}>
                  {!isApp && (
                    <>
                      <Badge compact={embedded} shell={shell}>Mid-market rate</Badge>
                      {usingNombaRate && (
                        <Badge compact={embedded} shell={shell}>Live rate</Badge>
                      )}
                      <Badge compact={embedded} shell={shell}>No hidden fees</Badge>
                      <Badge compact={embedded} shell={shell}>60s rate lock</Badge>
                    </>
                  )}
                  {isApp && (
                    <Badge compact={embedded} shell={shell}>Live rate</Badge>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {actionsVisible && (
          <div className={`mt-3 ${embedded || isApp ? "flex flex-col gap-2" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}`}>
            <button
              type="button"
              onClick={() => goNext(user ? "direct" : "signup")}
              disabled={continueDisabled ?? (rateUnavailable || sendNumeric <= 0)}
              className={`group inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[hsl(var(--accent-amber))] font-bold text-[hsl(var(--brand-900))] shadow-cta-amber transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${embedded ? "h-11 text-sm" : "h-10 text-[13px]"}`}
            >
              {resolvedContinueLabel}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
            {!user && !isApp && (
              <button
                type="button"
                onClick={() => goNext("signin")}
                className="inline-flex items-center justify-center h-10 rounded-full bg-white/10 hover:bg-white/15 ring-1 ring-white/20 text-white font-bold text-[13px] transition"
              >
                Sign in
              </button>
            )}
          </div>
        )}

        {showDisclaimer && (
          <p className={`mt-2 text-[9.5px] leading-relaxed ${shell.disclaimer}`}>
            {isApp
              ? "Live mid-market rate with eFinMoney fees applied. Final amount confirmed before you send."
              : "Indicative mid-market rate · 0.8% FX + $0.99 fee. Benchmarked against typical international money-transfer providers. Rate locks for 60 s after sign in."}
          </p>
        )}

        {footer}
      </div>
    </div>
  );
};

const Row = ({
  label, rate, fee, good, compact, shell,
}: {
  label: string;
  rate: string;
  fee: string;
  good?: boolean;
  compact?: boolean;
  shell: {
    rowGood: string;
    rowMuted: string;
    rowRateGood: string;
    rowRateMuted: string;
  };
}) => (
  <div className="flex items-start justify-between gap-2">
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      {good ? (
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-500 dark:text-emerald-400">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      <span className={good ? shell.rowGood : shell.rowMuted}>{label}</span>
    </div>
    <div className="min-w-0 max-w-[58%] flex-1 text-right">
      <div className={`break-words leading-snug tabular-nums ${compact ? "text-[10px]" : "text-[11px]"} ${good ? shell.rowRateGood : shell.rowRateMuted}`}>
        {rate}
      </div>
      <div className={`text-[10px] ${good ? "font-semibold text-emerald-600 dark:text-emerald-400" : shell.rowRateMuted}`}>{fee}</div>
    </div>
  </div>
);

const Badge = ({ children, compact, shell }: { children: React.ReactNode; compact?: boolean; shell: { badge: string } }) => (
  <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider ring-1 rounded-full ${shell.badge} ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"}`}>
    <Check className="h-2.5 w-2.5 text-emerald-500 dark:text-emerald-400" strokeWidth={3} />
    {children}
  </span>
);

const AmountRow = ({
  label, value, onChange, currency, onCurrencyChange, loading, highlight, currencyFilter, priorityCodes, compact, shell,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  loading?: boolean;
  highlight?: boolean;
  currencyFilter?: string[];
  priorityCodes?: readonly string[];
  compact?: boolean;
  shell: {
    amountRow: string;
    amountRowHi: string;
    amountLabel: string;
    amountInput: string;
    pickerBtn: string;
    popover: string;
    popoverInput: string;
    popoverEmpty: string;
    popoverItem: string;
    popoverMuted: string;
  };
}) => (
  <div className={`rounded-xl px-3 py-2.5 ring-1 ${highlight ? shell.amountRowHi : shell.amountRow}`}>
    <div className={`mb-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] ${shell.amountLabel}`}>{label}</div>
    <div className="flex items-center gap-2">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={loading ? "…" : "0.00"}
        className={`min-w-0 flex-1 border-0 bg-transparent font-black tabular-nums outline-none ${shell.amountInput} ${compact ? "text-xl" : "text-xl sm:text-2xl"}`}
      />
      <CurrencyPicker value={currency} onChange={onCurrencyChange} currencyFilter={currencyFilter} priorityCodes={priorityCodes} shell={shell} />
    </div>
  </div>
);

const CurrencyPicker = ({
  value, onChange, currencyFilter, priorityCodes, shell,
}: {
  value: string;
  onChange: (v: string) => void;
  currencyFilter?: string[];
  priorityCodes?: readonly string[];
  shell: {
    pickerBtn: string;
    popover: string;
    popoverInput: string;
    popoverEmpty: string;
    popoverItem: string;
    popoverMuted: string;
  };
}) => {
  const [open, setOpen] = useState(false);
  const baseOptions = currencyFilter?.length
    ? WORLD_CURRENCIES.filter((c) => currencyFilter.includes(c.code))
    : WORLD_CURRENCIES;
  const priority = priorityCodes?.length
    ? baseOptions.filter((c) => priorityCodes.includes(c.code))
    : [];
  const rest = priority.length
    ? baseOptions.filter((c) => !priorityCodes!.includes(c.code))
    : baseOptions;
  const renderItem = (c: typeof baseOptions[number]) => (
    <CommandItem
      key={c.code}
      value={`${c.code} ${c.name} ${c.country}`}
      onSelect={() => {
        onChange(c.code);
        setOpen(false);
      }}
      className={`flex items-center gap-2.5 cursor-pointer ${shell.popoverItem}`}
    >
      <Flag code={c.code} />
      <span className="font-bold w-12 tabular-nums">{c.code}</span>
      <span className={`flex-1 min-w-0 truncate ${shell.popoverMuted}`}>{c.name}</span>
      <span className={`text-[10px] truncate max-w-[80px] ${shell.popoverMuted}`}>{c.country}</span>
      {value === c.code && <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 pl-1.5 pr-2 h-9 rounded-lg ring-1 text-[12px] font-bold transition ${shell.pickerBtn}`}
        >
          <Flag code={value} />
          <span>{value}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={`w-[280px] p-0 ${shell.popover}`}
      >
        <Command className="bg-transparent">
          <div className="flex items-center gap-2 px-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground" />
            <CommandInput
              placeholder="Search currency or country…"
              className={`bg-transparent h-10 ${shell.popoverInput}`}
            />
          </div>
          <CommandList className="max-h-72">
            <CommandEmpty className={`py-6 text-center text-sm ${shell.popoverEmpty}`}>No match.</CommandEmpty>
            {priority.length > 0 && (
              <CommandGroup heading="Popular">
                {priority.map(renderItem)}
              </CommandGroup>
            )}
            <CommandGroup heading={priority.length > 0 ? "All" : undefined}>
              {rest.map(renderItem)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default LiveFxCalculator;
