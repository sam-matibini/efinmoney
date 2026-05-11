import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Plus, Share2, Wallet as WalletIcon } from "lucide-react";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useVirtualAccounts, useCreateVirtualAccount } from "@/hooks/useVirtualAccounts";

const AFRICA_CURRENCIES = ["NGN", "KES", "GHS", "ZAR", "UGX", "TZS", "ZMW", "RWF", "USD"];

const ReceivePage = () => {
  const { data: accounts, isLoading } = useVirtualAccounts();
  const create = useCreateVirtualAccount();
  const [currency, setCurrency] = useState("NGN");

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
          <div>
            <h1 className="text-2xl font-display font-bold">Receive Money</h1>
            <p className="text-muted-foreground">Share your virtual account details to get paid instantly.</p>
          </div>

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
