import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeftRight,
  Building2,
  Download,
  RefreshCw,
  Send,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import {
  useSaveVertoPartner,
  useVertoConvert,
  useVertoHistory,
  useVertoQuote,
  useVertoSend,
  useVertoStatus,
  useVertoWallets,
} from "@/hooks/useVertoClearing";

function money(n: number, ccy: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: ccy || "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${Number(n || 0).toFixed(2)} ${ccy}`;
  }
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  completed: "default",
  requested: "secondary",
  pending: "outline",
  archived: "destructive",
  refunded: "destructive",
  failed: "destructive",
};

export function VertoClearingPanel() {
  const status = useVertoStatus();
  const wallets = useVertoWallets();
  const history = useVertoHistory();
  const { data: partners = [] } = usePaymentPartners();
  const quote = useVertoQuote();
  const convert = useVertoConvert();
  const send = useVertoSend();
  const savePartner = useSaveVertoPartner();

  const [fromWallet, setFromWallet] = useState("");
  const [toWallet, setToWallet] = useState("");
  const [fxAmount, setFxAmount] = useState("10000");
  const [quotedRate, setQuotedRate] = useState<number | null>(null);
  const [quotedToken, setQuotedToken] = useState("");

  const [partnerId, setPartnerId] = useState("");
  const [sendWallet, setSendWallet] = useState("");
  const [sendAmount, setSendAmount] = useState("5000");
  const [flow, setFlow] = useState<"vpay" | "payout">("vpay");
  const [reference, setReference] = useState("");

  const [mapPartner, setMapPartner] = useState("");
  const [mapCompany, setMapCompany] = useState("");
  const [mapBeneficiary, setMapBeneficiary] = useState("");
  const [mapPurpose, setMapPurpose] = useState("");

  const walletList = wallets.data?.wallets ?? [];
  const from = walletList.find((w) => w.id === fromWallet);
  const to = walletList.find((w) => w.id === toWallet);
  const sendW = walletList.find((w) => w.id === sendWallet);
  const selectedPartner = partners.find((p) => p.id === partnerId);
  const mappedCount = partners.filter((p) => p.verto_company_id || p.verto_beneficiary_id).length;

  const partnerOptions = useMemo(
    () => partners.filter((p) => p.code !== "verto").sort((a, b) => a.name.localeCompare(b.name)),
    [partners],
  );

  const requestQuote = async () => {
    if (!from || !to) return toast.error("Choose both wallets");
    try {
      const res = await quote.mutateAsync({ from_currency: from.currency, to_currency: to.currency });
      setQuotedRate(res.rate);
      setQuotedToken(res.vfxToken);
      toast.success(`Locked ${from.currency}→${to.currency} at ${res.rate}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quote failed");
    }
  };

  const runConvert = async () => {
    if (!from || !to) return toast.error("Choose both wallets");
    const amount = Number(fxAmount);
    if (!amount) return toast.error("Enter an amount");
    try {
      await convert.mutateAsync({
        source_wallet_id: from.id,
        target_wallet_id: to.id,
        source_amount: amount,
        from_currency: from.currency,
        to_currency: to.currency,
        vfx_token: quotedToken,
        rate: quotedRate,
        reference: `Treasury FX ${from.currency}-${to.currency}`,
      });
      toast.success("FX conversion booked");
      setQuotedRate(null);
      setQuotedToken("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conversion failed");
    }
  };

  const runSend = async () => {
    if (!partnerId || !sendW) return toast.error("Choose a partner and a source wallet");
    const amount = Number(sendAmount);
    if (!amount) return toast.error("Enter an amount");
    try {
      await send.mutateAsync({
        partner_id: partnerId,
        source_wallet_id: sendW.id,
        source_amount: amount,
        currency: sendW.currency,
        flow,
        reference: reference || `Corporate flow to ${selectedPartner?.name}`,
      });
      toast.success(flow === "vpay" ? "V-Pay sent to partner" : "Bank payout submitted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    }
  };

  const saveMapping = async () => {
    if (!mapPartner) return toast.error("Choose a partner");
    try {
      await savePartner.mutateAsync({
        partner_id: mapPartner,
        verto_company_id: mapCompany,
        verto_beneficiary_id: mapBeneficiary,
        verto_purpose_id: mapPurpose,
      });
      toast.success("Partner Verto mapping saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save mapping");
    }
  };

  const loadMapping = (id: string) => {
    setMapPartner(id);
    const p = partners.find((x) => x.id === id);
    setMapCompany(p?.verto_company_id ?? "");
    setMapBeneficiary(p?.verto_beneficiary_id ?? "");
    setMapPurpose(p?.verto_purpose_id ?? "");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Verto corporate clearing
            </CardTitle>
            <CardDescription>
              Move funds between eFinMoney and corridor partners on Verto — wallet FX, V-Pay, and bank payouts.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : status.isError ? (
              <Badge variant="destructive">Could not reach Verto ops</Badge>
            ) : (
              <>
                <Badge variant={status.data?.configured ? "default" : "secondary"}>
                  {status.data?.mode === "live" ? "Live API" : "Mock mode"}
                </Badge>
                <Badge variant="outline">{status.data?.env ?? "sandbox"}</Badge>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void status.refetch();
                void wallets.refetch();
                void history.refetch();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground">Company ID</p>
            <p className="font-medium break-all">{status.data?.companyId || "Not returned yet"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Mapped partners</p>
            <p className="font-medium">{mappedCount} with V-Pay or beneficiary IDs</p>
          </div>
          <div>
            <p className="text-muted-foreground">Credentials</p>
            <p className="font-medium">
              {status.data?.configured
                ? status.data.loginOk
                  ? "Login succeeded"
                  : status.data.loginError || "Login failed"
                : "Set VERTO_CLIENT_ID and VERTO_API_KEY to go live"}
            </p>
          </div>
          {!status.data?.configured && !status.isLoading && (
            <p className="sm:col-span-3 text-xs text-muted-foreground">
              Mock mode books CAD/USD/EUR/GBP/NGN wallets locally so treasury can rehearse partner flows. Live traffic
              follows the Verto quote-and-book + WALLET_TO_BUSINESS / WALLET_PAYOUT guides at{" "}
              <a className="underline" href="https://docs.verto.co/" target="_blank" rel="noreferrer">
                docs.verto.co
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" /> Verto wallets
            </CardTitle>
            <CardDescription>Balances used to fund partner settlements</CardDescription>
          </CardHeader>
          <CardContent>
            {wallets.isLoading ? (
              <Skeleton className="h-32" />
            ) : wallets.isError ? (
              <p className="text-sm text-muted-foreground">Could not load wallets. {String(wallets.error)}</p>
            ) : walletList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No wallets yet. Create them in the Verto dashboard.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {walletList.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-xs">
                        {w.label || w.id}
                        {w.isDefault ? <Badge className="ml-2" variant="secondary">default</Badge> : null}
                      </TableCell>
                      <TableCell>{w.currency}</TableCell>
                      <TableCell className="text-right font-medium">{money(w.available, w.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="h-4 w-4" /> Convert between wallets
            </CardTitle>
            <CardDescription>Instant FX — quote locks for 30 seconds on live Verto</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>From</Label>
                <Select value={fromWallet} onValueChange={setFromWallet}>
                  <SelectTrigger><SelectValue placeholder="Source wallet" /></SelectTrigger>
                  <SelectContent>
                    {walletList.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.currency} · {w.label || w.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Select value={toWallet} onValueChange={setToWallet}>
                  <SelectTrigger><SelectValue placeholder="Target wallet" /></SelectTrigger>
                  <SelectContent>
                    {walletList.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.currency} · {w.label || w.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Amount to sell</Label>
              <Input value={fxAmount} onChange={(e) => setFxAmount(e.target.value)} inputMode="decimal" />
            </div>
            {quotedRate != null && from && to && (
              <p className="text-sm">
                Rate {quotedRate} → receive about{" "}
                <span className="font-medium">{money(Number(fxAmount || 0) * quotedRate, to.currency)}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void requestQuote()} disabled={quote.isPending}>
                Quote
              </Button>
              <Button onClick={() => void runConvert()} disabled={convert.isPending}>
                Book FX
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" /> Send to a partner
          </CardTitle>
          <CardDescription>
            V-Pay settles in seconds to another Verto company. Bank payout uses an approved Verto beneficiary.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {partnerOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.verto_company_id ? "· V-Pay" : p.verto_beneficiary_id ? "· payout" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Flow</Label>
            <Select value={flow} onValueChange={(v) => setFlow(v as "vpay" | "payout")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vpay">V-Pay (WALLET_TO_BUSINESS)</SelectItem>
                <SelectItem value="payout">Bank payout (WALLET_PAYOUT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Source wallet</Label>
            <Select value={sendWallet} onValueChange={setSendWallet}>
              <SelectTrigger><SelectValue placeholder="Wallet to debit" /></SelectTrigger>
              <SelectContent>
                {walletList.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.currency} · {money(w.available, w.currency)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice, corridor, or ops note" />
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => void runSend()} disabled={send.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Send funds
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Map partners onto Verto</CardTitle>
          <CardDescription>
            Store each partner&apos;s Verto company ID for V-Pay, or approved beneficiary ID for bank settlement.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Partner</Label>
            <Select value={mapPartner} onValueChange={loadMapping}>
              <SelectTrigger><SelectValue placeholder="Select partner to map" /></SelectTrigger>
              <SelectContent>
                {partnerOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Verto company ID (V-Pay)</Label>
            <Input value={mapCompany} onChange={(e) => setMapCompany(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Verto beneficiary ID (bank payout)</Label>
            <Input value={mapBeneficiary} onChange={(e) => setMapBeneficiary(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Purpose ID override</Label>
            <Input value={mapPurpose} onChange={(e) => setMapPurpose(e.target.value)} placeholder={status.data?.purposeId || "1"} />
          </div>
          <div>
            <Button variant="outline" onClick={() => void saveMapping()} disabled={savePartner.isPending}>
              Save mapping
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" /> Clearing history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <Skeleton className="h-40" />
          ) : (history.data?.transfers ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No Verto movements yet. Quote an FX or send to a partner.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Flow</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history.data?.transfers ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(t.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs uppercase">{t.flow_type}</TableCell>
                    <TableCell className="text-xs">{t.payment_partners?.name || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {money(t.source_amount, t.source_currency)}
                      {t.dest_currency && t.dest_currency !== t.source_currency
                        ? ` → ${money(t.dest_amount || 0, t.dest_currency)}`
                        : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>
                        {t.status}
                        {t.mode === "mock" ? " · mock" : ""}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
