import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Copy, ExternalLink, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StripeConfigProps {
  onBack: () => void;
}

interface ModeInfo {
  mode: "live" | "test";
  keyPrefix: string;
  publishableKeyMasked: string | null;
  publishableKeyPrefix: string;
  accountId: string;
  country: string;
  defaultCurrency: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  businessType?: string;
  email?: string;
  capabilities: Record<string, string>;
}

export function StripeConfig({ onBack }: StripeConfigProps) {
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [mode, setMode] = useState<ModeInfo | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [modeLoading, setModeLoading] = useState(false);

  const checkMode = async () => {
    setModeLoading(true);
    setModeError(null);
    const { data, error } = await supabase.functions.invoke("stripe-mode-check");
    if (error || (data as any)?.error) {
      setModeError(error?.message || (data as any)?.error || "Failed to check mode");
      setMode(null);
    } else {
      setMode(data as ModeInfo);
    }
    setModeLoading(false);
  };

  useEffect(() => {
    supabase.functions
      .invoke("stripe-config-status")
      .then(({ data }) => data && setStatus(data as Record<string, boolean>))
      .catch(() => {});
    checkMode();
  }, []);

  const StatusRow = ({ label, ok }: { label: string; ok?: boolean }) => (
    <div className="flex items-center justify-between p-2 rounded border text-sm">
      <span>{label}</span>
      {ok ? (
        <span className="flex items-center gap-1 text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> Configured
        </span>
      ) : (
        <span className="flex items-center gap-1 text-muted-foreground">
          <XCircle className="h-4 w-4" /> Missing
        </span>
      )}
    </div>
  );

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`;
  const payoutWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-payout-webhook`;
  const payinWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-payin-webhook`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Stripe Configuration</h2>
          <p className="text-muted-foreground">Manage your Stripe payment integration settings</p>
        </div>
        <Button variant="outline" onClick={onBack}>Back to Integrations</Button>
      </div>

      {/* Mode & Account (live diagnostic) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            Mode & Account
            {mode && (
              <Badge
                className={
                  mode.mode === "live"
                    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-600 border-amber-500/30"
                }
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {mode.mode === "live" ? "LIVE MODE" : "TEST MODE"}
              </Badge>
            )}
            {modeError && (
              <Badge className="bg-red-500/15 text-red-600 border-red-500/30">
                <XCircle className="h-3 w-3 mr-1" /> Error
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Live diagnostic — reads <code>STRIPE_SECRET_KEY</code> and calls Stripe's <code>/v1/account</code> to confirm the configured environment and account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {modeError && (
            <div className="p-3 rounded border border-red-500/30 bg-red-500/5 text-sm text-red-600">
              {modeError}
            </div>
          )}
          {mode && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Account ID</p>
                  <p className="font-mono text-sm break-all">{mode.accountId}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Country / Currency</p>
                  <p className="text-sm">{mode.country?.toUpperCase()} · {mode.defaultCurrency?.toUpperCase()}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Account Email</p>
                  <p className="text-sm truncate">{mode.email || "—"}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Charges</p>
                  <p className="text-sm">{mode.chargesEnabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Payouts</p>
                  <p className="text-sm">{mode.payoutsEnabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Onboarding</p>
                  <p className="text-sm">{mode.detailsSubmitted ? "Complete" : "Incomplete"}</p>
                </div>
              </div>
              {Object.keys(mode.capabilities ?? {}).length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Capabilities</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(mode.capabilities).map(([k, v]) => (
                      <Badge
                        key={k}
                        variant="outline"
                        className={
                          v === "active"
                            ? "border-emerald-500/40 text-emerald-600"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }
                      >
                        {k}: {v}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={checkMode} disabled={modeLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${modeLoading ? "animate-spin" : ""}`} /> Re-check
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(
                  mode?.mode === "test"
                    ? "https://dashboard.stripe.com/test"
                    : "https://dashboard.stripe.com/",
                  "_blank",
                )
              }
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Open Stripe Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backend Secrets Status */}
      <Card>
        <CardHeader>
          <CardTitle>Backend Secrets Status</CardTitle>
          <CardDescription>Which Stripe credentials are configured in Lovable Cloud</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <StatusRow label="Secret key (STRIPE_SECRET_KEY)" ok={status?.hasSecretKey} />
          <StatusRow label="Publishable key (STRIPE_PUBLISHABLE_KEY)" ok={status?.hasPublishableKey} />
          <StatusRow label="Pay-in webhook (STRIPE_PAYIN_WEBHOOK_SECRET)" ok={status?.hasPayinWebhookSecret} />
          <StatusRow label="Payout webhook (STRIPE_PAYOUT_WEBHOOK_SECRET)" ok={status?.hasPayoutWebhookSecret} />
          <StatusRow label="Issuing webhook (STRIPE_ISSUING_WEBHOOK_SECRET)" ok={status?.hasIssuingWebhookSecret} />
          <StatusRow label="General webhook (STRIPE_WEBHOOK_SECRET)" ok={status?.hasGeneralWebhookSecret} />
        </CardContent>
      </Card>

      {/* API Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>API Credentials</CardTitle>
          <CardDescription>Configure your Stripe API keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Environment</Label>
            <Select defaultValue="production">
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Test Mode</SelectItem>
                <SelectItem value="production">Live Mode</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Publishable Key</Label>
              <div className="flex gap-2">
                <Input 
                  value="pk_live_51ABC...xyz" 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard("pk_live_51ABC...xyz", "Publishable key")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Secret Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input 
                    type={showSecretKey ? "text" : "password"}
                    value="sk_live_51ABC...xyz" 
                    className="font-mono text-sm pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                  >
                    {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>Configure webhook endpoints for real-time event notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook Endpoint URL</Label>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Paste this URL into your Stripe Dashboard → Developers → Webhooks.</p>
          </div>

          <div className="space-y-2">
            <Label>Webhook Signing Secret</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input 
                  type={showWebhookSecret ? "text" : "password"}
                  placeholder="whsec_..." 
                  className="font-mono text-sm"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                >
                  {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Subscribed Events</Label>
            <div className="grid gap-2 md:grid-cols-2">
              {[
                { event: "payment_intent.succeeded", enabled: true },
                { event: "payment_intent.failed", enabled: true },
                { event: "customer.created", enabled: true },
                { event: "customer.updated", enabled: true },
                { event: "invoice.paid", enabled: true },
                { event: "invoice.payment_failed", enabled: true },
                { event: "charge.refunded", enabled: true },
                { event: "payout.paid", enabled: false },
              ].map((item) => (
                <div key={item.event} className="flex items-center justify-between p-2 border rounded">
                  <code className="text-sm">{item.event}</code>
                  <Switch defaultChecked={item.enabled} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card-push payouts (Visa Direct) */}
      <Card>
        <CardHeader>
          <CardTitle>Card-Push Payouts (Visa Direct / Mastercard Send)</CardTitle>
          <CardDescription>
            Used for instant CAD payouts to a recipient's Canadian debit card from the Send → Canada flow.
            Requires the "Card payouts" capability to be enabled on your Stripe account by Stripe support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Payout Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={payoutWebhookUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(payoutWebhookUrl, "Payout webhook URL")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              In the Stripe Dashboard, add a separate webhook endpoint pointing here, subscribed to{" "}
              <code>payout.paid</code>, <code>payout.failed</code>, and <code>payout.canceled</code>.
              Paste the resulting signing secret into the <code>STRIPE_PAYOUT_WEBHOOK_SECRET</code> backend secret.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* International pay-in (Stripe Checkout) */}
      <Card>
        <CardHeader>
          <CardTitle>International Pay-In (Stripe Checkout)</CardTitle>
          <CardDescription>
            Lets users in any country top up their wallet using cards, Apple Pay, Google Pay, Link, iDEAL, Bancontact, SEPA, BACS, etc. Supported wallet currencies: USD, CAD, EUR, GBP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pay-In Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={payinWebhookUrl} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(payinWebhookUrl, "Pay-in webhook URL")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              In Stripe Dashboard → Developers → Webhooks, add an endpoint pointing here, subscribed to{" "}
              <code>checkout.session.completed</code> and <code>charge.refunded</code>. Paste the resulting
              signing secret into the <code>STRIPE_PAYIN_WEBHOOK_SECRET</code> backend secret.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 text-sm">
            <div className="p-3 rounded-md border bg-muted/30">
              <p className="font-medium">Fee</p>
              <p className="text-muted-foreground">1.9% + 0.30 (per currency)</p>
            </div>
            <div className="p-3 rounded-md border bg-muted/30">
              <p className="font-medium">Limits</p>
              <p className="text-muted-foreground">5 – 5,000 per transaction</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cross-border card-push corridors */}
      <Card>
        <CardHeader>
          <CardTitle>Cross-Border Card-Push Corridors</CardTitle>
          <CardDescription>
            Countries where instant payouts to recipient debit cards are supported via Stripe Visa Direct.
            Each corridor requires the card-payout capability to be approved on your platform by Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-3">
            {[
              { code: "CA", name: "Canada", currency: "CAD", status: "Live" },
              { code: "US", name: "United States", currency: "USD", status: "Backend ready" },
              { code: "GB", name: "United Kingdom", currency: "GBP", status: "Backend ready" },
              { code: "EU", name: "EU-27 (EUR)", currency: "EUR", status: "Backend ready" },
            ].map((c) => (
              <div key={c.code} className="p-3 border rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.currency}</p>
                </div>
                <Badge variant={c.status === "Live" ? "default" : "outline"}>{c.status}</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Africa corridors (NG, KE, GH, UG, TZ, ZM, MW, RW, CD) are routed through PawaPay (mobile money) and Circle CPN (bank, USDC settled), not Stripe.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payment Settings</CardTitle>
          <CardDescription>Configure payment processing options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Default Currency</Label>
              <Select defaultValue="usd">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD - US Dollar</SelectItem>
                  <SelectItem value="eur">EUR - Euro</SelectItem>
                  <SelectItem value="gbp">GBP - British Pound</SelectItem>
                  <SelectItem value="cad">CAD - Canadian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Statement Descriptor</Label>
              <Input defaultValue="YOURCOMPANY" maxLength={22} />
              <p className="text-xs text-muted-foreground">Max 22 characters, appears on customer statements</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Payment Methods</Label>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { method: "Card Payments", enabled: true },
                { method: "Apple Pay", enabled: true },
                { method: "Google Pay", enabled: true },
                { method: "Bank Transfers (ACH)", enabled: false },
                { method: "SEPA Direct Debit", enabled: false },
                { method: "iDEAL", enabled: false },
              ].map((item) => (
                <div key={item.method} className="flex items-center justify-between p-3 border rounded">
                  <span className="text-sm">{item.method}</span>
                  <Switch defaultChecked={item.enabled} />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Advanced Options</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">3D Secure Authentication</p>
                  <p className="text-sm text-muted-foreground">Require 3DS for all card payments</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">Automatic Tax Calculation</p>
                  <p className="text-sm text-muted-foreground">Use Stripe Tax for automatic tax collection</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">Radar Fraud Protection</p>
                  <p className="text-sm text-muted-foreground">Enable advanced fraud detection</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button onClick={() => toast.success("Stripe configuration saved!")}>Save Changes</Button>
      </div>
    </div>
  );
}
