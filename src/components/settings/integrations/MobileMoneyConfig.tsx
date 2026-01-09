import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface MobileMoneyConfigProps {
  onBack: () => void;
  provider: "mpesa" | "mtn_momo" | "airtel_money";
}

const providerConfig = {
  mpesa: {
    name: "M-Pesa",
    company: "Safaricom",
    regions: ["Kenya", "Tanzania", "Mozambique", "DRC", "Ghana", "Lesotho", "Egypt"],
    status: "connected" as const,
  },
  mtn_momo: {
    name: "MTN Mobile Money",
    company: "MTN Group",
    regions: ["Ghana", "Uganda", "Rwanda", "Cameroon", "Côte d'Ivoire", "Benin", "Congo"],
    status: "error" as const,
  },
  airtel_money: {
    name: "Airtel Money",
    company: "Airtel Africa",
    regions: ["Kenya", "Uganda", "Tanzania", "Malawi", "Zambia", "Nigeria", "DRC"],
    status: "disconnected" as const,
  },
};

export function MobileMoneyConfig({ onBack, provider }: MobileMoneyConfigProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const config = providerConfig[provider];

  const getStatusBadge = () => {
    switch (config.status) {
      case "connected":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>;
      case "disconnected":
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> Disconnected</Badge>;
      case "error":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Error</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{config.name} Configuration</h2>
          <p className="text-muted-foreground">Configure {config.company} mobile money integration</p>
        </div>
        <Button variant="outline" onClick={onBack}>Back to Integrations</Button>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Connection Status
            {getStatusBadge()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {config.status === "error" && (
            <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive font-medium">Connection Error</p>
              <p className="text-sm text-muted-foreground">API authentication failed. Please verify your credentials.</p>
              <Button variant="outline" size="sm" className="mt-2">
                <RefreshCw className="h-4 w-4 mr-2" /> Retry Connection
              </Button>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Merchant Code</p>
              <p className="font-mono text-sm">{provider.toUpperCase()}-MERCH-001</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Short Code</p>
              <p className="font-mono text-sm">123456</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Active Regions</p>
              <p className="text-sm">{config.regions.slice(0, 3).join(", ")}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Daily Volume</p>
              <p className="text-sm font-medium">$45,230</p>
            </div>
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
            <Select defaultValue={config.status === "connected" ? "production" : "sandbox"}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Consumer Key / API Key</Label>
              <div className="relative">
                <Input 
                  type={showApiKey ? "text" : "password"}
                  placeholder="Enter API key"
                  defaultValue={config.status !== "disconnected" ? "api_key_xxxxx" : ""}
                  className="font-mono text-sm pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Consumer Secret / API Secret</Label>
              <div className="relative">
                <Input 
                  type={showApiSecret ? "text" : "password"}
                  placeholder="Enter API secret"
                  defaultValue={config.status !== "disconnected" ? "••••••••••••" : ""}
                  className="font-mono text-sm pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowApiSecret(!showApiSecret)}
                >
                  {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {provider === "mpesa" && (
            <>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Initiator Name</Label>
                  <Input defaultValue="api_initiator" />
                </div>
                <div className="space-y-2">
                  <Label>Security Credential</Label>
                  <Input type="password" placeholder="Encrypted credential" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Passkey</Label>
                  <Input type="password" placeholder="Lipa Na M-Pesa passkey" />
                </div>
                <div className="space-y-2">
                  <Label>Till Number</Label>
                  <Input defaultValue="174379" className="font-mono" />
                </div>
              </div>
            </>
          )}

          {provider === "mtn_momo" && (
            <>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Subscription Key (Primary)</Label>
                  <Input type="password" placeholder="Ocp-Apim-Subscription-Key" />
                </div>
                <div className="space-y-2">
                  <Label>Subscription Key (Secondary)</Label>
                  <Input type="password" placeholder="Backup subscription key" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>X-Reference-Id (User UUID)</Label>
                <Input defaultValue="f6a0b0d1-c2d3-4e5f-8a9b-0c1d2e3f4a5b" className="font-mono" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Regional Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Regional Settings</CardTitle>
          <CardDescription>Configure country-specific settings</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={config.regions[0].toLowerCase().replace(" ", "_")}>
            <TabsList className="mb-4">
              {config.regions.slice(0, 4).map((region) => (
                <TabsTrigger key={region} value={region.toLowerCase().replace(" ", "_")}>
                  {region}
                </TabsTrigger>
              ))}
            </TabsList>
            {config.regions.slice(0, 4).map((region) => (
              <TabsContent key={region} value={region.toLowerCase().replace(" ", "_")} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select defaultValue="local">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local Currency</SelectItem>
                        <SelectItem value="usd">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Transaction Limit</Label>
                    <Input type="number" defaultValue="50000" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">Enable for {region}</p>
                    <p className="text-sm text-muted-foreground">Accept payments in this region</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Transaction Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Settings</CardTitle>
          <CardDescription>Configure payment processing options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Min Transaction Amount</Label>
              <Input type="number" defaultValue="1" />
            </div>
            <div className="space-y-2">
              <Label>Max Transaction Amount</Label>
              <Input type="number" defaultValue="150000" />
            </div>
            <div className="space-y-2">
              <Label>Transaction Timeout (seconds)</Label>
              <Input type="number" defaultValue="60" />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Features</Label>
            {[
              { name: "C2B (Customer to Business)", description: "Accept payments from customers", enabled: true },
              { name: "B2C (Business to Customer)", description: "Send money to customers", enabled: true },
              { name: "B2B (Business to Business)", description: "Transfer between businesses", enabled: false },
              { name: "Account Balance Query", description: "Check account balance via API", enabled: true },
              { name: "Transaction Status Query", description: "Query transaction status", enabled: true },
              { name: "Reversal", description: "Reverse failed transactions", enabled: true },
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                <Switch defaultChecked={item.enabled} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Callback URLs */}
      <Card>
        <CardHeader>
          <CardTitle>Callback URLs</CardTitle>
          <CardDescription>Configure webhook endpoints for transaction notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Validation URL</Label>
            <Input 
              defaultValue={`https://api.yourapp.com/webhooks/${provider}/validate`}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Confirmation URL</Label>
            <Input 
              defaultValue={`https://api.yourapp.com/webhooks/${provider}/confirm`}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Result URL</Label>
            <Input 
              defaultValue={`https://api.yourapp.com/webhooks/${provider}/result`}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Timeout URL</Label>
            <Input 
              defaultValue={`https://api.yourapp.com/webhooks/${provider}/timeout`}
              className="font-mono text-sm"
            />
          </div>
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
