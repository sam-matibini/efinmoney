import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Plus, Share2, Wallet as WalletIcon } from "lucide-react";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import BackToDashboard from "@/components/layout/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useVirtualAccounts, useCreateVirtualAccount } from "@/hooks/useVirtualAccounts";
import { useProfile } from "@/hooks/useProfile";
import { AtSign, Hash } from "lucide-react";

const AFRICA_CURRENCIES = ["NGN", "KES", "GHS", "ZAR", "UGX", "TZS", "ZMW", "RWF", "USD"];

const ReceivePage = () => {
  const { data: accounts, isLoading } = useVirtualAccounts();
  const { data: profile } = useProfile();
  const create = useCreateVirtualAccount();
  const [currency, setCurrency] = useState("NGN");
  const efinAcct = (profile as any)?.account_number as string | undefined;
  const efinTag = (profile as any)?.efin_tag as string | undefined;

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

  const handleCreate = async () => {
    try {
      await create.mutateAsync(currency);
      toast.success(`${currency} virtual account ready`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create account");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-3xl mx-auto">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-display font-bold">Receive Money</h1>
            <p className="text-muted-foreground">Share your virtual account details to get paid instantly.</p>
          </div>


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

          <Card>
            <CardHeader><CardTitle>Add a virtual account</CardTitle></CardHeader>
            <CardContent className="flex gap-3 items-end">
              <div className="flex-1">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AFRICA_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={create.isPending}>
                <Plus className="w-4 h-4 mr-2" />
                {create.isPending ? "Creating..." : "Generate"}
              </Button>
            </CardContent>
          </Card>

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !accounts || accounts.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <WalletIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No virtual accounts yet. Generate one above to start receiving funds.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {accounts.map((a) => (
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
          )}

          <p className="text-sm text-muted-foreground">
            Funds appear in your wallet automatically once the sender completes the transfer.
          </p>
        </motion.div>
      </main>
      <MobileNav />
    </div>
  );
};

export default ReceivePage;
