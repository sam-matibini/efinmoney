import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Landmark, Plus, Send, Share2, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useVirtualAccounts, useCreateVirtualAccount } from "@/hooks/useVirtualAccounts";
import { useProfile } from "@/hooks/useProfile";
import { useWallets } from "@/hooks/useWallets";
import { BANK_VA_CURRENCIES, bankVaLabel, isBankVaCurrency } from "@/lib/bankVirtualAccounts";
import { productFeatures } from "@/lib/productFeatures";

type Props = {
  /** Lock the generator to this wallet currency (e.g. Top up / wallet modal). */
  lockedCurrency?: string;
  defaultCurrency?: string;
  compact?: boolean;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BankVirtualAccountCard({
  lockedCurrency,
  defaultCurrency = "NGN",
  compact = false,
}: Props) {
  const { data: accounts, isLoading } = useVirtualAccounts();
  const { data: profile } = useProfile();
  const { data: wallets } = useWallets();
  const create = useCreateVirtualAccount();

  const locked = lockedCurrency ? lockedCurrency.toUpperCase() : "";
  const start = isBankVaCurrency(locked)
    ? locked
    : isBankVaCurrency(defaultCurrency)
      ? defaultCurrency.toUpperCase()
      : "NGN";
  const [currency, setCurrency] = useState(start);

  const kycApproved =
    profile?.kyc_status === "approved" || profile?.kyc_status === "verified";

  const active = useMemo(
    () =>
      (accounts ?? []).filter(
        (a) => a.status === "active" && isBankVaCurrency(a.currency_code),
      ),
    [accounts],
  );

  const missingCurrencies = useMemo(() => {
    const have = new Set(active.map((a) => a.currency_code.toUpperCase()));
    const pool = locked && isBankVaCurrency(locked) ? [locked] : [...BANK_VA_CURRENCIES];
    return pool.filter((c) => !have.has(c));
  }, [active, locked]);

  useEffect(() => {
    if (isBankVaCurrency(locked)) setCurrency(locked);
    else if (!locked && isBankVaCurrency(defaultCurrency)) setCurrency(defaultCurrency.toUpperCase());
  }, [locked, defaultCurrency]);

  useEffect(() => {
    if (
      missingCurrencies.length
      && !missingCurrencies.includes(currency as (typeof BANK_VA_CURRENCIES)[number])
    ) {
      setCurrency(missingCurrencies[0]);
    }
  }, [missingCurrencies, currency]);

  if (!productFeatures.flutterwave) return null;
  if (locked && !isBankVaCurrency(locked)) return null;

  const walletFor = (code: string) =>
    (wallets ?? []).find((w) => String(w.currency_code).toUpperCase() === code.toUpperCase());

  const copy = async (txt: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success("Copied");
  };

  const share = async (a: {
    account_number: string;
    bank_name: string;
    account_name: string;
    currency_code: string;
  }) => {
    const text = `Send ${a.currency_code} to my eFin Money account:\nBank: ${a.bank_name}\nAccount: ${a.account_number}\nName: ${a.account_name}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* cancelled */
      }
    } else {
      await copy(text);
    }
  };

  const handleCreate = async () => {
    try {
      await create.mutateAsync(currency);
      toast.success(`${currency} bank account ready`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create account");
    }
  };

  const accountBlock = (a: (typeof active)[number]) => {
    const w = walletFor(a.currency_code);
    const bal = w ? Number(w.balance) : null;
    return (
      <div key={a.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline">{a.currency_code}</Badge>
            <span className="text-sm text-muted-foreground truncate">{a.bank_name}</span>
          </div>
          <Badge>{a.is_permanent ? "Permanent" : a.status}</Badge>
        </div>
        <div>
          <p className="text-xs uppercase text-muted-foreground">Account number</p>
          <p className="text-2xl font-display font-bold tracking-wide">{a.account_number}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-muted-foreground">Account name</p>
          <p className="font-medium">{a.account_name}</p>
        </div>
        {bal != null && (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{a.currency_code} wallet balance · </span>
            <span className="font-semibold tabular-nums">
              {fmt(bal)} {a.currency_code}
            </span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          This is a deposit address only — money lands in your {a.currency_code} wallet. Spend or send from there.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => copy(a.account_number)}>
            <Copy className="w-4 h-4 mr-2" />Copy
          </Button>
          <Button variant="outline" size="sm" onClick={() => share(a)}>
            <Share2 className="w-4 h-4 mr-2" />Share
          </Button>
          {w?.wallet_id && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/wallets/${w.wallet_id}/statement`}>
                <Wallet className="w-4 h-4 mr-2" />Wallet
              </Link>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link to={`/send?currency=${a.currency_code}`}>
              <Send className="w-4 h-4 mr-2" />Send
            </Link>
          </Button>
        </div>
      </div>
    );
  };

  const generateBlock =
    missingCurrencies.length > 0 ? (
      <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">
          {active.length
            ? "Need another currency? Generate a permanent bank account — transfers credit that wallet."
            : `Get a permanent ${currency} bank account. Anyone can transfer into it from their bank app — funds land in your ${currency} wallet.`}
          {currency === "NGN" ? " Nigeria accounts may need a BVN on a verified profile." : ""}
        </p>

        {!kycApproved && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">Verify your identity first</p>
            <p className="text-muted-foreground mt-1">
              Bank deposit accounts need an approved KYC profile. You can still receive from other eFin users with your account number or @tag.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link to="/kyc">Complete verification</Link>
            </Button>
          </div>
        )}

        {!locked && missingCurrencies.length > 1 && (
          <div>
            <p className="text-xs uppercase text-muted-foreground mb-1.5">Currency</p>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {missingCurrencies.map((c) => (
                  <SelectItem key={c} value={c}>{bankVaLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button onClick={handleCreate} disabled={create.isPending || !kycApproved} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          {create.isPending ? "Creating…" : `Generate ${currency} bank account`}
        </Button>
      </div>
    ) : null;

  const body = (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-3">
              {!compact && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your bank accounts
                </p>
              )}
              {active.map(accountBlock)}
            </div>
          )}
          {generateBlock}
        </>
      )}
    </div>
  );

  if (compact) return body;

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="w-4 h-4" />
          Bank transfer — NGN &amp; GHS
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
