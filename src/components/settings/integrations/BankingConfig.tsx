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
import { Eye, EyeOff, CheckCircle2, Building2, Globe, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface BankingConfigProps {
  onBack: () => void;
  provider: "plaid" | "wise";
}

const providerConfig = {
  plaid: {
    name: "Plaid",
    description: "Bank account verification and data aggregation",
    icon: <Building2 className="h-6 w-6" />,
    products: ["Auth", "Transactions", "Identity", "Balance", "Assets", "Investments"],
  },
  wise: {
    name: "Wise (TransferWise)",
    description: "International bank transfers at real exchange rates",
    icon: <Globe className="h-6 w-6" />,
    products: ["Transfers", "Multi-currency", "Batch Payments", "Webhooks"],
  },
};

export function BankingConfig({ onBack, provider }: BankingConfigProps) {
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);
  const config = providerConfig[provider];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{config.name} Configuration</h2>
          <p className="text-muted-foreground">{config.description}</p>
        </div>
        <Button variant="outline" onClick={onBack}>Back to Integrations</Button>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Connection Status
            <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Client ID</p>
              <p className="font-mono text-sm truncate">{provider === "plaid" ? "client_xxxxx" : "profile_xxxxx"}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Active Links</p>
              <p className="text-sm font-medium">{provider === "plaid" ? "1,284" : "892"}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Last Sync</p>
              <p className="text-sm">10 minutes ago</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">API Calls (Today)</p>
              <p className="text-sm font-medium">4,521</p>
            </div>
          </div>
          <div className="mt-4">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" /> Sync All Connections
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
          <CardDescription>Configure your {config.name} API credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Environment</Label>
            <Select defaultValue="production">
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {provider === "plaid" ? (
                  <>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {provider === "plaid" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input 
                  defaultValue="client_prod_xxxxx"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Secret</Label>
                <div className="relative">
                  <Input 
                    type={showClientSecret ? "text" : "password"}
                    defaultValue="••••••••••••••••"
                    className="font-mono text-sm pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowClientSecret(!showClientSecret)}
                  >
                    {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {provider === "wise" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>API Token</Label>
                <div className="relative">
                  <Input 
                    type={showApiToken ? "text" : "password"}
                    defaultValue="••••••••••••••••••••"
                    className="font-mono text-sm pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiToken(!showApiToken)}
                  >
                    {showApiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Profile ID</Label>
                <Input 
                  defaultValue="12345678"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products / Features */}
      <Card>
        <CardHeader>
          <CardTitle>{provider === "plaid" ? "Plaid Products" : "Features"}</CardTitle>
          <CardDescription>Enable or disable {config.name} features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {provider === "plaid" && (
            <div className="space-y-3">
              {[
                { name: "Auth", description: "Verify bank account ownership and route payments", enabled: true },
                { name: "Transactions", description: "Access historical transaction data", enabled: true },
                { name: "Identity", description: "Retrieve identity information from financial institutions", enabled: true },
                { name: "Balance", description: "Check real-time and historical account balances", enabled: true },
                { name: "Assets", description: "Generate asset reports for income verification", enabled: false },
                { name: "Investments", description: "Access investment account holdings", enabled: false },
                { name: "Liabilities", description: "Access liability account information", enabled: false },
                { name: "Income", description: "Verify income through payroll data", enabled: false },
              ].map((product) => (
                <div key={product.name} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.description}</p>
                  </div>
                  <Switch defaultChecked={product.enabled} />
                </div>
              ))}
            </div>
          )}

          {provider === "wise" && (
            <div className="space-y-3">
              {[
                { name: "Single Transfers", description: "Send individual international transfers", enabled: true },
                { name: "Batch Payments", description: "Process multiple transfers at once", enabled: true },
                { name: "Multi-currency Accounts", description: "Hold and manage multiple currencies", enabled: true },
                { name: "Recipient Management", description: "Store and manage recipient details", enabled: true },
                { name: "Exchange Rates API", description: "Access real-time exchange rates", enabled: true },
                { name: "Direct Debits", description: "Set up recurring payments", enabled: false },
              ].map((feature) => (
                <div key={feature.name} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">{feature.name}</p>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                  <Switch defaultChecked={feature.enabled} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link Settings (Plaid) or Transfer Settings (Wise) */}
      {provider === "plaid" && (
        <Card>
          <CardHeader>
            <CardTitle>Link Configuration</CardTitle>
            <CardDescription>Configure Plaid Link settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Link Token Expiration (hours)</Label>
                <Input type="number" defaultValue="4" />
              </div>
              <div className="space-y-2">
                <Label>Country Codes</Label>
                <Select defaultValue="us">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us">US Only</SelectItem>
                    <SelectItem value="us_ca">US & Canada</SelectItem>
                    <SelectItem value="us_ca_gb">US, Canada & UK</SelectItem>
                    <SelectItem value="eu">European Union</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {[
                { name: "OAuth Redirect", description: "Enable OAuth bank linking flow", enabled: true },
                { name: "Same Day Micro-deposits", description: "Use same-day micro-deposits for verification", enabled: false },
                { name: "Update Mode", description: "Allow users to update existing connections", enabled: true },
                { name: "Account Selection", description: "Let users select specific accounts", enabled: true },
              ].map((setting) => (
                <div key={setting.name} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">{setting.name}</p>
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  </div>
                  <Switch defaultChecked={setting.enabled} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {provider === "wise" && (
        <Card>
          <CardHeader>
            <CardTitle>Transfer Settings</CardTitle>
            <CardDescription>Configure transfer processing options</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Default Source Currency</Label>
                <Select defaultValue="usd">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD</SelectItem>
                    <SelectItem value="eur">EUR</SelectItem>
                    <SelectItem value="gbp">GBP</SelectItem>
                    <SelectItem value="cad">CAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transfer Reference Prefix</Label>
                <Input defaultValue="WS" maxLength={4} className="font-mono" />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {[
                { name: "Auto-fund Transfers", description: "Automatically fund transfers from balance", enabled: true },
                { name: "Rate Alerts", description: "Get notified when rates reach target", enabled: false },
                { name: "Require Approval", description: "Require manual approval for large transfers", enabled: true },
              ].map((setting) => (
                <div key={setting.name} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">{setting.name}</p>
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  </div>
                  <Switch defaultChecked={setting.enabled} />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Large Transfer Threshold</Label>
              <Input type="number" defaultValue="10000" />
              <p className="text-xs text-muted-foreground">Transfers above this amount require approval</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>Configure webhook endpoints for event notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input 
              defaultValue={`https://api.yourapp.com/webhooks/${provider}`}
              className="font-mono text-sm"
            />
          </div>

          {provider === "plaid" && (
            <div className="space-y-3">
              <Label>Webhook Events</Label>
              <div className="grid gap-2 md:grid-cols-2">
                {[
                  { event: "TRANSACTIONS", enabled: true },
                  { event: "AUTH", enabled: true },
                  { event: "ITEM", enabled: true },
                  { event: "HOLDINGS", enabled: false },
                  { event: "ASSETS", enabled: false },
                  { event: "LIABILITIES", enabled: false },
                ].map((item) => (
                  <div key={item.event} className="flex items-center justify-between p-2 border rounded">
                    <code className="text-sm">{item.event}</code>
                    <Switch defaultChecked={item.enabled} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {provider === "wise" && (
            <div className="space-y-3">
              <Label>Webhook Events</Label>
              <div className="grid gap-2 md:grid-cols-2">
                {[
                  { event: "transfers#state-change", enabled: true },
                  { event: "transfers#active-cases", enabled: true },
                  { event: "balances#credit", enabled: true },
                  { event: "balances#update", enabled: false },
                ].map((item) => (
                  <div key={item.event} className="flex items-center justify-between p-2 border rounded">
                    <code className="text-sm">{item.event}</code>
                    <Switch defaultChecked={item.enabled} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button onClick={() => toast.success(`${config.name} configuration saved!`)}>Save Changes</Button>
      </div>
    </div>
  );
}
