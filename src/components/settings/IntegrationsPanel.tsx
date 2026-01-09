import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CreditCard, 
  Smartphone, 
  Building2, 
  Globe, 
  Key, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings2,
  ExternalLink,
  Eye,
  EyeOff
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: "payments" | "cards" | "mobile_money" | "banking" | "crypto" | "compliance";
  icon: React.ReactNode;
  status: "connected" | "disconnected" | "error";
  enabled: boolean;
  lastSync?: string;
  apiKeyConfigured: boolean;
  webhookUrl?: string;
  environment: "sandbox" | "production";
}

const integrations: Integration[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept online payments, subscriptions, and payouts",
    category: "payments",
    icon: <CreditCard className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "2 minutes ago",
    apiKeyConfigured: true,
    webhookUrl: "https://api.example.com/webhooks/stripe",
    environment: "production"
  },
  {
    id: "visa_direct",
    name: "Visa Direct",
    description: "Real-time push payments to Visa cards worldwide",
    category: "cards",
    icon: <CreditCard className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "5 minutes ago",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "mastercard_send",
    name: "Mastercard Send",
    description: "Fast, secure money transfers to Mastercard accounts",
    category: "cards",
    icon: <CreditCard className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
  },
  {
    id: "mpesa",
    name: "M-Pesa",
    description: "Mobile money integration for East Africa",
    category: "mobile_money",
    icon: <Smartphone className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "1 hour ago",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "mtn_momo",
    name: "MTN Mobile Money",
    description: "Mobile money services across Africa",
    category: "mobile_money",
    icon: <Smartphone className="h-6 w-6" />,
    status: "error",
    enabled: true,
    lastSync: "Failed 30 mins ago",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "airtel_money",
    name: "Airtel Money",
    description: "Mobile wallet and payments platform",
    category: "mobile_money",
    icon: <Smartphone className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
  },
  {
    id: "plaid",
    name: "Plaid",
    description: "Bank account verification and data aggregation",
    category: "banking",
    icon: <Building2 className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "10 minutes ago",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "wise",
    name: "Wise (TransferWise)",
    description: "International bank transfers at real exchange rates",
    category: "banking",
    icon: <Globe className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "15 minutes ago",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "coinbase",
    name: "Coinbase Commerce",
    description: "Accept cryptocurrency payments",
    category: "crypto",
    icon: <Globe className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
  },
  {
    id: "chainalysis",
    name: "Chainalysis",
    description: "Blockchain compliance and investigation",
    category: "compliance",
    icon: <Globe className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "Just now",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "onfido",
    name: "Onfido",
    description: "Identity verification and KYC checks",
    category: "compliance",
    icon: <Globe className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "3 minutes ago",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "sumsub",
    name: "Sumsub",
    description: "All-in-one verification platform",
    category: "compliance",
    icon: <Globe className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
  }
];

const categoryLabels: Record<string, string> = {
  payments: "Payment Gateways",
  cards: "Card Networks",
  mobile_money: "Mobile Money",
  banking: "Banking & Transfers",
  crypto: "Cryptocurrency",
  compliance: "Compliance & KYC"
};

export function IntegrationsPanel() {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const getStatusBadge = (status: Integration["status"]) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>;
      case "disconnected":
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> Disconnected</Badge>;
      case "error":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Error</Badge>;
    }
  };

  const handleTestConnection = (integration: Integration) => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 2000)),
      {
        loading: `Testing connection to ${integration.name}...`,
        success: `${integration.name} connection successful!`,
        error: `Failed to connect to ${integration.name}`
      }
    );
  };

  const handleSync = (integration: Integration) => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1500)),
      {
        loading: `Syncing with ${integration.name}...`,
        success: `${integration.name} synced successfully!`,
        error: `Failed to sync ${integration.name}`
      }
    );
  };

  const groupedIntegrations = integrations.reduce((acc, integration) => {
    if (!acc[integration.category]) {
      acc[integration.category] = [];
    }
    acc[integration.category].push(integration);
    return acc;
  }, {} as Record<string, Integration[]>);

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {integrations.filter(i => i.status === "connected").length}
            </div>
            <p className="text-xs text-muted-foreground">Connected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-muted-foreground">
              {integrations.filter(i => i.status === "disconnected").length}
            </div>
            <p className="text-xs text-muted-foreground">Disconnected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {integrations.filter(i => i.status === "error").length}
            </div>
            <p className="text-xs text-muted-foreground">Errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">
              {integrations.filter(i => i.enabled).length}
            </div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
      </div>

      {/* Integration Categories */}
      {Object.entries(groupedIntegrations).map(([category, categoryIntegrations]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-lg">{categoryLabels[category]}</CardTitle>
            <CardDescription>
              Manage your {categoryLabels[category].toLowerCase()} integrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-lg">
                      {integration.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{integration.name}</h4>
                        {getStatusBadge(integration.status)}
                        <Badge variant="outline" className="text-xs">
                          {integration.environment}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{integration.description}</p>
                      {integration.lastSync && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Last synced: {integration.lastSync}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={integration.enabled}
                      onCheckedChange={() => toast.success(`${integration.name} ${integration.enabled ? 'disabled' : 'enabled'}`)}
                    />
                    {integration.status === "connected" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSync(integration)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Dialog open={configOpen && selectedIntegration?.id === integration.id} onOpenChange={(open) => {
                      setConfigOpen(open);
                      if (open) setSelectedIntegration(integration);
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Settings2 className="h-4 w-4 mr-2" />
                          Configure
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            {integration.icon}
                            Configure {integration.name}
                          </DialogTitle>
                          <DialogDescription>
                            Manage API credentials and settings for this integration
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Environment</Label>
                            <Select defaultValue={integration.environment}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sandbox">Sandbox</SelectItem>
                                <SelectItem value="production">Production</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>API Key</Label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input
                                  type={showApiKey ? "text" : "password"}
                                  placeholder="Enter API key"
                                  defaultValue={integration.apiKeyConfigured ? "sk_live_***********************" : ""}
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
                          </div>

                          <div className="space-y-2">
                            <Label>Secret Key</Label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input
                                  type="password"
                                  placeholder="Enter secret key"
                                  defaultValue={integration.apiKeyConfigured ? "sk_secret_***********************" : ""}
                                />
                              </div>
                            </div>
                          </div>

                          {integration.webhookUrl && (
                            <div className="space-y-2">
                              <Label>Webhook URL</Label>
                              <div className="flex gap-2">
                                <Input
                                  readOnly
                                  value={integration.webhookUrl}
                                  className="font-mono text-xs"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    navigator.clipboard.writeText(integration.webhookUrl!);
                                    toast.success("Webhook URL copied!");
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label>Webhook Secret</Label>
                            <Input
                              type="password"
                              placeholder="Enter webhook secret"
                            />
                          </div>
                        </div>
                        <DialogFooter className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleTestConnection(integration)}
                          >
                            <Key className="h-4 w-4 mr-2" />
                            Test Connection
                          </Button>
                          <Button onClick={() => {
                            toast.success(`${integration.name} configuration saved!`);
                            setConfigOpen(false);
                          }}>
                            Save Changes
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add New Integration */}
      <Card className="border-dashed">
        <CardContent className="py-8">
          <div className="text-center">
            <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Add New Integration</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect additional payment providers, card networks, or compliance tools
            </p>
            <Button>
              Browse Integrations
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
