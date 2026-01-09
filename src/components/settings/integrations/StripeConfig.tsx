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
import { Eye, EyeOff, Copy, ExternalLink, RefreshCw, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface StripeConfigProps {
  onBack: () => void;
}

export function StripeConfig({ onBack }: StripeConfigProps) {
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

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

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Connection Status
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Account ID</p>
              <p className="font-mono text-sm">acct_1234567890</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Last Sync</p>
              <p className="text-sm">2 minutes ago</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">API Version</p>
              <p className="font-mono text-sm">2024-12-18</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" /> Sync Now
            </Button>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" /> Open Stripe Dashboard
            </Button>
          </div>
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
                value="https://api.yourapp.com/webhooks/stripe" 
                readOnly 
                className="font-mono text-sm"
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard("https://api.yourapp.com/webhooks/stripe", "Webhook URL")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
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

      {/* Payment Settings */}
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
