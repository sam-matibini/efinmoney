import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  createSwychrAirtimeRecharge,
  fetchSwychrAirtimeCatalog,
  productLabel,
  productSkuId,
  type SwychrAirtimeProduct,
} from "@/lib/swychrAirtime";
import { useWallets } from "@/hooks/useWallets";
import { getCountryIso2 } from "@/lib/countryIso";

interface Props {
  countryId: string;
  currency: string;
}

export default function SwychrAirtimePanel({ countryId, currency }: Props) {
  const countryIso = getCountryIso2(countryId);
  const { data: wallets } = useWallets();
  const matchingWallets = useMemo(
    () => (wallets ?? []).filter((w) => w.currency_code === currency),
    [wallets, currency],
  );

  const [products, setProducts] = useState<SwychrAirtimeProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [skuId, setSkuId] = useState("");
  const [mobile, setMobile] = useState("");
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setSkuId("");
    try {
      const data = await fetchSwychrAirtimeCatalog(countryIso);
      const list = (data.products ?? data.data ?? data) as SwychrAirtimeProduct[] | Record<string, unknown>;
      const arr = Array.isArray(list) ? list : [];
      setProducts(arr);
      if (arr.length) {
        const first = arr[0];
        setSkuId(productSkuId(first));
        if (first.amount) setAmount(String(first.amount));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load airtime catalog");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [countryIso]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    if (matchingWallets.length && !matchingWallets.some((w) => w.wallet_id === walletId)) {
      setWalletId(matchingWallets[0].wallet_id);
    }
  }, [matchingWallets, walletId]);

  const selected = products.find((p) => productSkuId(p) === skuId);

  const handleRecharge = async () => {
    const amt = Number(amount);
    if (!skuId || !mobile.trim()) return toast.error("Select a product and enter a phone number");
    if (!Number.isFinite(amt) || amt < 1) return toast.error("Enter a valid amount");
    setSubmitting(true);
    try {
      const result = await createSwychrAirtimeRecharge({
        country: countryIso,
        skuId,
        amount: amt,
        mobile: mobile.trim(),
        wallet_id: walletId || undefined,
        purchaseCurrency: currency,
      });
      if (result.success) toast.success("Airtime sent successfully");
      else toast.error("Recharge failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recharge failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-violet-500/25">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4 text-violet-400" />
          Mobile airtime
          <Badge variant="outline" className="text-xs">Swychr</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Buy airtime for {countryId} via Swychr PrepayNation catalog.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />Loading products…
          </p>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No airtime products for this country.</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={skuId} onValueChange={(v) => {
                setSkuId(v);
                const p = products.find((x) => productSkuId(x) === v);
                if (p?.amount) setAmount(String(p.amount));
              }}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => {
                    const id = productSkuId(p);
                    return (
                      <SelectItem key={id} value={id}>{productLabel(p)}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phone number</Label>
              <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+234…" />
            </div>
            <div className="space-y-2">
              <Label>Amount ({currency})</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} />
              {selected?.amount != null && (
                <p className="text-xs text-muted-foreground">Suggested: {selected.amount}</p>
              )}
            </div>
            {matchingWallets.length > 0 && (
              <div className="space-y-2">
                <Label>Pay from wallet</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {matchingWallets.map((w) => (
                      <SelectItem key={w.wallet_id} value={w.wallet_id}>
                        {w.flag_emoji} {w.currency_code} — {w.symbol}{Number(w.balance).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="w-full" onClick={handleRecharge} disabled={submitting}>
              {submitting ? "Sending…" : `Buy airtime`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
