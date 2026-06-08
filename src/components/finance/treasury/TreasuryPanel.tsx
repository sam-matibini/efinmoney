import { useState } from "react";
import { useTreasury, type TreasuryFA } from "@/hooks/useTreasury";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Building2, Plus, Eye, ArrowDownToLine, ArrowUpFromLine, Send, CreditCard } from "lucide-react";
import { InboundTransferDialog } from "./InboundTransferDialog";
import { OutboundTransferDialog } from "./OutboundTransferDialog";
import { OutboundPaymentDialog } from "./OutboundPaymentDialog";
import { TreasuryActivityTable } from "./TreasuryActivityTable";

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n ?? 0);
}

export function TreasuryPanel() {
  const { list, createFa, reveal } = useTreasury();
  const [revealed, setRevealed] = useState<Record<string, { routing_number: string; account_number: string }>>({});
  const [activeFa, setActiveFa] = useState<TreasuryFA | null>(null);
  const [dlg, setDlg] = useState<null | "in" | "out" | "pay">(null);

  if (list.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (list.error) {
    return <Card><CardContent className="p-6 text-destructive">Failed to load treasury data: {(list.error as any).message}</CardContent></Card>;
  }

  const data = list.data!;
  const fas = data.financial_accounts ?? [];
  const isStaff = data.staff;

  async function handleReveal(fa: TreasuryFA) {
    try {
      const r = await reveal.mutateAsync(fa.id);
      setRevealed(prev => ({ ...prev, [fa.id]: r }));
    } catch (e: any) {
      toast({ title: "Reveal failed", description: e?.message, variant: "destructive" });
    }
  }

  async function handleCreate(kind: "platform" | "user") {
    try {
      await createFa.mutateAsync({ owner_kind: kind });
      toast({ title: "Financial account created" });
    } catch (e: any) {
      toast({ title: "Create failed", description: e?.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-display font-semibold">Stripe Treasury</h2>
          <p className="text-sm text-muted-foreground">USD financial accounts with ACH and wire</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleCreate("user")} disabled={createFa.isPending}>
            <Plus className="h-4 w-4 mr-1" /> My USD account
          </Button>
          {isStaff && (
            <Button size="sm" onClick={() => handleCreate("platform")} disabled={createFa.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Platform account
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-3 pt-3">
          {fas.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              No financial accounts yet. Create one to start receiving ACH/wire deposits.
            </CardContent></Card>
          )}
          {fas.map(fa => {
            const acct = revealed[fa.id];
            return (
              <Card key={fa.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {fa.owner_kind === "platform" ? "Platform USD" : "User USD"}
                      <Badge variant={fa.status === "open" ? "default" : "secondary"}>{fa.status}</Badge>
                    </span>
                    <span className="text-sm font-mono text-muted-foreground">{fa.stripe_fa_id}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Available</p>
                      <p className="text-2xl font-semibold">{fmtUSD(Number(fa.balance_available))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="text-2xl font-semibold">{fmtUSD(Number(fa.balance_pending))}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Routing</p>
                      <p className="font-mono">{acct?.routing_number ?? fa.aba_routing ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Account</p>
                      <p className="font-mono">{acct?.account_number ?? (fa.account_number_last4 ? `••••${fa.account_number_last4}` : "—")}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => handleReveal(fa)} disabled={reveal.isPending}>
                      <Eye className="h-4 w-4 mr-1" /> Reveal numbers
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setActiveFa(fa); setDlg("in"); }}>
                      <ArrowDownToLine className="h-4 w-4 mr-1" /> Inbound ACH
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setActiveFa(fa); setDlg("out"); }}>
                      <ArrowUpFromLine className="h-4 w-4 mr-1" /> Outbound transfer
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setActiveFa(fa); setDlg("pay"); }}>
                      <Send className="h-4 w-4 mr-1" /> Pay third-party
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="activity" className="pt-3">
          <TreasuryActivityTable transfers={data.transfers ?? []} received={data.received ?? []} />
        </TabsContent>
      </Tabs>

      {activeFa && dlg === "in" && (
        <InboundTransferDialog fa={activeFa} onOpenChange={(o) => !o && setDlg(null)} />
      )}
      {activeFa && dlg === "out" && (
        <OutboundTransferDialog fa={activeFa} onOpenChange={(o) => !o && setDlg(null)} />
      )}
      {activeFa && dlg === "pay" && (
        <OutboundPaymentDialog fa={activeFa} onOpenChange={(o) => !o && setDlg(null)} />
      )}
    </div>
  );
}
