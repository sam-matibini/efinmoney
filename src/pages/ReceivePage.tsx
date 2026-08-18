import { useMemo } from "react";
import { motion } from "framer-motion";
import { Copy, Plus, Share2, Wallet as WalletIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import BackToDashboard from "@/components/layout/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useVirtualAccounts } from "@/hooks/useVirtualAccounts";
import { useProfile } from "@/hooks/useProfile";
import { AtSign, Hash } from "lucide-react";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import ZambiaMoMoReceiveLinks from "@/components/payments/ZambiaMoMoReceiveLinks";
import BankVirtualAccountCard from "@/components/payments/BankVirtualAccountCard";
import { productFeatures } from "@/lib/productFeatures";
import { isBankVaCurrency } from "@/lib/bankVirtualAccounts";

const ReceivePage = () => {
  const [params] = useSearchParams();
  const { data: accounts, isLoading } = useVirtualAccounts();
  const { data: profile } = useProfile();
  const defaultCurrency = useMemo(() => {
    const q = (params.get("currency") || "").toUpperCase();
    return isBankVaCurrency(q) ? q : "NGN";
  }, [params]);
  const efinAcct = (profile as any)?.account_number as string | undefined;
  const efinTag = (profile as any)?.efin_tag as string | undefined;
  const leftoverAccounts = (accounts ?? []).filter((a) => !isBankVaCurrency(a.currency_code));

  const copy = async (txt: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success("Copied to clipboard");
  };

  const share = async (a: { account_number: string; bank_name: string; account_name: string }) => {
    const text = `Send money to my eFin Money account:\nBank: ${a.bank_name}\nAccount: ${a.account_number}\nName: ${a.account_name}`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* noop */ }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("Account details copied");
    }
  };

  return (
    <AppPage width="default">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-display font-bold">Receive Money</h1>
            <p className="text-muted-foreground">Share a bank account number for NGN or GHS transfers, or your eFin tag for in-app sends.</p>
          </div>

          <PageHeroBanner
            icon={WalletIcon}
            label="Your receive details"
            value={efinTag ? `@${efinTag}` : efinAcct || "Set up your identity"}
            meta={[
              { icon: Hash, text: efinAcct ? `Account ${efinAcct}` : "Account number in profile settings" },
              { icon: Plus, text: `${accounts?.length ?? 0} virtual account${(accounts?.length ?? 0) === 1 ? "" : "s"} active` },
            ]}
            variant="emerald"
          />


          <BankVirtualAccountCard defaultCurrency={defaultCurrency} />

          {/* In-network identity: account # + @tag */}
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="text-base">Receive from another eFinMoney user</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground mb-1">
                  <Hash className="w-3.5 h-3.5" /> Account number
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xl font-display font-bold tracking-wide truncate">{efinAcct || "—"}</p>
                  {efinAcct && (
                    <Button size="sm" variant="ghost" onClick={() => copy(efinAcct)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground mb-1">
                  <AtSign className="w-3.5 h-3.5" /> eFin tag
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xl font-display font-bold truncate">{efinTag ? `@${efinTag}` : "Not set"}</p>
                  {efinTag && (
                    <Button size="sm" variant="ghost" onClick={() => copy(`@${efinTag}`)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {productFeatures.elicate && <ZambiaMoMoReceiveLinks />}

          <Card className="border-indigo-500/30 bg-indigo-500/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/15 text-primary text-xs font-bold">i</span>
                Interac e-Transfer (Canada)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Securely send and receive your money anytime, to any Canadian bank account with Interac e-Transfer.
              </p>
            </CardContent>
          </Card>

          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : leftoverAccounts.length > 0 ? (
            <div className="space-y-3">
              {leftoverAccounts.map((a) => (
                <Card key={a.id}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{a.currency_code}</Badge>
                        <span className="text-sm text-muted-foreground">{a.bank_name}</span>
                      </div>
                      <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Account number</p>
                      <p className="text-2xl font-display font-bold tracking-wide">{a.account_number}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Account name</p>
                      <p className="font-medium">{a.account_name}</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => copy(a.account_number)}>
                        <Copy className="w-4 h-4 mr-2" />Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => share(a)}>
                        <Share2 className="w-4 h-4 mr-2" />Share
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">
            Bank transfers credit your NGN or GHS wallet automatically. USD virtual accounts are not available yet.
          </p>
        </motion.div>
    </AppPage>
  );
};

export default ReceivePage;
