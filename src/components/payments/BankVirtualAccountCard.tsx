import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Landmark, Plus, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useVirtualAccounts, useCreateVirtualAccount } from "@/hooks/useVirtualAccounts";
import { useProfile } from "@/hooks/useProfile";
import { BANK_VA_CURRENCIES, bankVaLabel, isBankVaCurrency } from "@/lib/bankVirtualAccounts";
import { productFeatures } from "@/lib/productFeatures";

type Props = {
  /** Lock the generator to this wallet currency (e.g. Top up / wallet modal). */
  lockedCurrency?: string;
  defaultCurrency?: string;
  compact?: boolean;
};

export default function BankVirtualAccountCard({
  lockedCurrency,
  defaultCurrency = "NGN",
  compact = false,
}: Props) {
  const { data: accounts, isLoading } = useVirtualAccounts();
  const { data: profile } = useProfile();
  const create = useCreateVirtualAccount();

  const locked = lockedCurrency ? lockedCurrency.toUpperCase() : "";
  const start = isBankVaCurrency(locked)
    ? locked
    : isBankVaCurrency(defaultCurrency)
      ? defaultCurrency.toUpperCase()
      : "NGN";
  const [currency, setCurrency] = useState(start);

  useEffect(() => {
    if (isBankVaCurrency(locked)) setCurrency(locked);
    else if (!locked && isBankVaCurrency(defaultCurrency)) setCurrency(defaultCurrency.toUpperCase());
  }, [locked, defaultCurrency]);

  if (!productFeatures.flutterwave) return null;
  if (locked && !isBankVaCurrency(locked)) return null;

  const kycApproved =
    profile?.kyc_status === "approved" || profile?.kyc_status === "verified";
  const active = (accounts ?? []).filter(
    (a) => a.status === "active" && isBankVaCurrency(a.currency_code),
  );
  const current = active.find((a) => a.currency_code === currency);

  const copy = async (txt: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success("Copied");
  };

  const share = async (a: { account_number: string; bank_name: string; account_name: string; currency_code: string }) => {
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

  const accountBlock = (a: (typeof active)[number]) => (
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
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => copy(a.account_number)}>
          <Copy className="w-4 h-4 mr-2" />Copy
        </Button>
        <Button variant="outline" size="sm" onClick={() => share(a)}>
          <Share2 className="w-4 h-4 mr-2" />Share
        </Button>
      </div>
    </div>
  );

  const body = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Get a permanent {currency} bank account. Anyone can transfer into it from their bank app — funds land in your {currency} wallet.
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

      {!locked && (
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-1.5">Currency</p>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BANK_VA_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{bankVaLabel(c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : current ? (
        accountBlock(current)
      ) : (
        <Button onClick={handleCreate} disabled={create.isPending || !kycApproved} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          {create.isPending ? "Creating…" : `Generate ${currency} bank account`}
        </Button>
      )}

      {!compact && !locked && active.filter((a) => a.currency_code !== currency).map(accountBlock)}
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
