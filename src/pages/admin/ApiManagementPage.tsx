import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Activity, CheckCircle2, AlertTriangle, Plug, Webhook, Code2,
  Eye, RefreshCw, Lock, Globe, Server,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type IntegrationKey = "flutterwave" | "stripe" | "paysafe" | "plaid" | "persona" | "mpesa";

const INTEGRATIONS: Array<{
  key: IntegrationKey;
  name: string;
  description: string;
  envHints: string[];
}> = [
  { key: "flutterwave", name: "Flutterwave", description: "African payouts, top-ups & bills", envHints: ["FLW_SECRET_KEY", "FLW_PUBLIC_KEY"] },
  { key: "stripe", name: "Stripe", description: "Card charges & Visa Direct payouts", envHints: ["STRIPE_SECRET_KEY"] },
  { key: "paysafe", name: "Paysafe", description: "Canadian Interac & EFT payouts", envHints: ["PAYSAFE_API_KEY"] },
  { key: "plaid", name: "Plaid", description: "Bank account linking & balances", envHints: ["PLAID_CLIENT_ID", "PLAID_SECRET"] },
  { key: "persona", name: "Persona", description: "KYC & ID verification", envHints: ["PERSONA_API_KEY"] },
  { key: "mpesa", name: "M-Pesa", description: "Mobile money (Kenya)", envHints: ["MPESA_CONSUMER_KEY"] },
];

const EDGE_FUNCTIONS: Array<{ name: string; description: string; jwt: boolean }> = [
  { name: "execute-transfer", description: "Cross-border transfer execution", jwt: true },
  { name: "fx-engine", description: "FX rate quotes & swap execution", jwt: true },
  { name: "compliance-monitoring", description: "AML rule evaluation", jwt: true },
  { name: "flutterwave-payout", description: "Initiates Flutterwave payouts", jwt: true },
  { name: "flutterwave-webhook", description: "Receives Flutterwave events", jwt: false },
  { name: "paysafe-payout", description: "Initiates Paysafe payouts", jwt: true },
  { name: "paysafe-webhook", description: "Receives Paysafe events", jwt: false },
  { name: "stripe-payout", description: "Visa Direct push payouts", jwt: true },
  { name: "stripe-webhook", description: "Receives Stripe events", jwt: false },
  { name: "stripe-payout-webhook", description: "Receives Stripe payout events", jwt: false },
  { name: "persona-webhook", description: "Receives Persona KYC events", jwt: false },
  { name: "approve-kyc", description: "Admin KYC approval", jwt: true },
  { name: "reject-kyc", description: "Admin KYC rejection", jwt: true },
  { name: "admin-create-user", description: "Admin user provisioning", jwt: true },
  { name: "admin-delete-user", description: "Admin user deletion", jwt: true },
  { name: "generate-receipt", description: "PDF transfer receipts", jwt: true },
  { name: "send-email", description: "Transactional email via Resend", jwt: false },
  { name: "refresh-fx-rates", description: "Cron-style FX rate refresh", jwt: false },
  { name: "crypto-trading", description: "Fiat ⇄ Crypto execution", jwt: true },
  { name: "bank-reconciliation", description: "Match imported bank txns", jwt: true },
];

export default function ApiManagementPage() {
  const [selectedPayload, setSelectedPayload] = useState<{ provider: string; event: string; payload: unknown } | null>(null);

  // Integration health
  const { data: integrations, isLoading: loadingIntegrations, refetch: refetchIntegrations } = useQuery({
    queryKey: ["admin-integration-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("integration_settings").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Webhook logs (Flutterwave + Paysafe)
  const { data: webhookLogs, isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["admin-webhook-logs"],
    queryFn: async () => {
      const [flw, paysafe] = await Promise.all([
        supabase.from("flw_webhook_logs")
          .select("id, event, payload, processed, error, received_at")
          .order("received_at", { ascending: false }).limit(50),
        supabase.from("paysafe_webhook_logs")
          .select("id, event_type, raw_payload, processed, processing_error, created_at")
          .order("created_at", { ascending: false }).limit(50),
      ]);
      const rows: Array<{
        id: string; provider: string; event: string; status: "ok" | "error" | "pending";
        timestamp: string; payload: unknown; error?: string | null;
      }> = [];
      (flw.data ?? []).forEach((r) => rows.push({
        id: `flw-${r.id}`, provider: "flutterwave",
        event: r.event ?? "unknown",
        status: r.error ? "error" : r.processed ? "ok" : "pending",
        timestamp: r.received_at, payload: r.payload, error: r.error,
      }));
      (paysafe.data ?? []).forEach((r) => rows.push({
        id: `psf-${r.id}`, provider: "paysafe",
        event: r.event_type ?? "unknown",
        status: r.processing_error ? "error" : r.processed ? "ok" : "pending",
        timestamp: r.created_at, payload: r.raw_payload, error: r.processing_error,
      }));
      rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return rows.slice(0, 50);
    },
  });

  const integrationStatus = (key: IntegrationKey) => {
    const row = (integrations ?? []).find((r: any) => r.key === key);
    if (row?.is_enabled) return { label: "Connected", healthy: true };
    if (row) return { label: "Action Required", healthy: false };
    return { label: "Not Configured", healthy: false };
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-7 w-7 text-primary" />
            System & API Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor integration health, inspect webhook traffic, and audit edge functions.
          </p>
        </div>
      </div>

      <Tabs defaultValue="integrations" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="integrations" className="gap-2"><Plug className="h-4 w-4" />Integrations</TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2"><Webhook className="h-4 w-4" />Webhook Logs</TabsTrigger>
          <TabsTrigger value="functions" className="gap-2"><Code2 className="h-4 w-4" />Edge Functions</TabsTrigger>
        </TabsList>

        {/* Integrations */}
        <TabsContent value="integrations" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button variant="outline" size="sm" onClick={() => refetchIntegrations()} disabled={loadingIntegrations}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingIntegrations ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.map((integ) => {
              const status = integrationStatus(integ.key);
              return (
                <Card key={integ.key} className="hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          {integ.name}
                        </CardTitle>
                        <CardDescription className="mt-1">{integ.description}</CardDescription>
                      </div>
                      {status.healthy ? (
                        <Badge className="bg-green-500/15 text-green-500 hover:bg-green-500/20 border-green-500/30 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {status.label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30 gap-1">
                          <AlertTriangle className="h-3 w-3" /> {status.label}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground mb-3 font-mono">
                      {integ.envHints.join(" · ")}
                    </div>
                    <Button
                      size="sm" variant="secondary" className="w-full"
                      onClick={() => toast.success(`${integ.name}: connectivity test queued`, { description: "Live ping not yet wired — placeholder OK response." })}
                    >
                      Test Connection
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Webhook logs */}
        <TabsContent value="webhooks" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Live Webhook Traffic</CardTitle>
                <CardDescription>Most recent 50 events across all providers</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchLogs()} disabled={loadingLogs}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingLogs ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Payload</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingLogs ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                    ) : (webhookLogs ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No webhook events yet</TableCell></TableRow>
                    ) : (
                      (webhookLogs ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatDistanceToNow(new Date(row.timestamp), { addSuffix: true })}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{row.provider}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{row.event}</TableCell>
                          <TableCell>
                            {row.status === "ok" ? (
                              <Badge className="bg-green-500/15 text-green-500 border-green-500/30">processed</Badge>
                            ) : row.status === "error" ? (
                              <Badge className="bg-red-500/15 text-red-500 border-red-500/30">error</Badge>
                            ) : (
                              <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30">pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedPayload({ provider: row.provider, event: row.event, payload: row.payload })}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Edge functions */}
        <TabsContent value="functions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Edge Functions Directory</CardTitle>
              <CardDescription>Deployed serverless functions powering eFinMoney</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Function</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Auth</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {EDGE_FUNCTIONS.map((fn) => (
                      <TableRow key={fn.name}>
                        <TableCell className="font-mono text-sm">{fn.name}</TableCell>
                        <TableCell className="text-muted-foreground">{fn.description}</TableCell>
                        <TableCell>
                          {fn.jwt ? (
                            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> JWT</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-500 border-blue-500/30"><Globe className="h-3 w-3" /> Public</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-green-500/15 text-green-500 border-green-500/30">Active</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payload viewer */}
      <Dialog open={!!selectedPayload} onOpenChange={(open) => !open && setSelectedPayload(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              {selectedPayload?.provider} · <span className="font-mono text-sm">{selectedPayload?.event}</span>
            </DialogTitle>
          </DialogHeader>
          <pre className="bg-muted rounded-md p-4 overflow-auto text-xs font-mono flex-1">
            <code>{JSON.stringify(selectedPayload?.payload ?? {}, null, 2)}</code>
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
