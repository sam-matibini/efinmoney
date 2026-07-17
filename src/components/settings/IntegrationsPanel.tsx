import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  CreditCard, 
  Smartphone, 
  Building2, 
  Globe, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StripeConfig } from "./integrations/StripeConfig";
import { VisaDirectConfig } from "./integrations/VisaDirectConfig";
import { MobileMoneyConfig } from "./integrations/MobileMoneyConfig";
import { ComplianceConfig } from "./integrations/ComplianceConfig";
import { BankingConfig } from "./integrations/BankingConfig";

type ConfigView = 
  | { type: "list" }
  | { type: "stripe" }
  | { type: "visa_direct" }
  | { type: "mobile_money"; provider: "mpesa" | "mtn_momo" | "airtel_money" }
  | { type: "compliance"; provider: "chainalysis" | "onfido" | "sumsub" }
  | { type: "banking"; provider: "plaid" | "wise" };

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
    id: "nomba",
    name: "Nigeria (bank & card)",
    description: "NGN bank payouts, FX, and international collection — live user-facing rail",
    category: "payments",
    icon: <Globe className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "Live",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "ghana_pay",
    name: "Ghana Pay",
    description: "GHS collection and mobile-money payouts — live user-facing rail",
    category: "payments",
    icon: <Smartphone className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "Live",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "swychr",
    name: "Swychr Connect",
    description: "Secondary payin, payout, virtual cards, and airtime — sandbox only until enabled",
    category: "payments",
    icon: <Globe className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Card charges and checkout — backend only; hidden from user UI",
    category: "payments",
    icon: <CreditCard className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
  },
  {
    id: "visa_direct",
    name: "Visa Direct",
    description: "Card push payouts",
    category: "cards",
    icon: <CreditCard className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
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
    description: "Mobile money for East Africa — not user-facing yet",
    category: "mobile_money",
    icon: <Smartphone className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
  },
  {
    id: "mtn_momo",
    name: "MTN Mobile Money",
    description: "Pan-African MoMo — Ghana live via Ghana Pay",
    category: "mobile_money",
    icon: <Smartphone className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
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
    description: "Bank account linking and verification — live",
    category: "banking",
    icon: <Building2 className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "Live",
    apiKeyConfigured: true,
    environment: "production"
  },
  {
    id: "wise",
    name: "Wise (TransferWise)",
    description: "International bank transfers — not connected",
    category: "banking",
    icon: <Globe className="h-6 w-6" />,
    status: "disconnected",
    enabled: false,
    apiKeyConfigured: false,
    environment: "sandbox"
  },
  {
    id: "coinbase",
    name: "Coinbase Commerce",
    description: "Cryptocurrency payments",
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
    description: "Enhanced due diligence — admin-launched ID + AML checks",
    category: "compliance",
    icon: <Globe className="h-6 w-6" />,
    status: "connected",
    enabled: true,
    lastSync: "Live",
    apiKeyConfigured: true,
    environment: (import.meta.env.VITE_SUMSUB_ENV as "sandbox" | "production") || "sandbox"
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
  const [currentView, setCurrentView] = useState<ConfigView>({ type: "list" });
  const queryClient = useQueryClient();

  const { data: settings = [] } = useQuery({
    queryKey: ["integration_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("key, is_enabled");
      if (error) throw error;
      return data ?? [];
    },
  });

  const settingsMap = new Map(
    (settings as { key: string; is_enabled: boolean }[]).map((s) => [s.key, s.is_enabled])
  );

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("integration_settings")
        .upsert({ key, is_enabled: enabled }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["integration_settings"] });
      toast.success(`Integration ${vars.enabled ? "enabled" : "disabled"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleConfigure = (integrationId: string) => {
    switch (integrationId) {
      case "stripe": setCurrentView({ type: "stripe" }); break;
      case "visa_direct": setCurrentView({ type: "visa_direct" }); break;
      case "mpesa": setCurrentView({ type: "mobile_money", provider: "mpesa" }); break;
      case "mtn_momo": setCurrentView({ type: "mobile_money", provider: "mtn_momo" }); break;
      case "airtel_money": setCurrentView({ type: "mobile_money", provider: "airtel_money" }); break;
      case "chainalysis": setCurrentView({ type: "compliance", provider: "chainalysis" }); break;
      case "onfido": setCurrentView({ type: "compliance", provider: "onfido" }); break;
      case "sumsub": setCurrentView({ type: "compliance", provider: "sumsub" }); break;
      case "plaid": setCurrentView({ type: "banking", provider: "plaid" }); break;
      case "wise": setCurrentView({ type: "banking", provider: "wise" }); break;
      default: toast.info("Configuration page not available");
    }
  };

  const goBack = () => setCurrentView({ type: "list" });

  const getStatusBadge = (status: Integration["status"]) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>;
      case "disconnected":
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> Disconnected</Badge>;
      case "error":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Error</Badge>;
    }
  };

  const groupedIntegrations = integrations.reduce((acc, integration) => {
    if (!acc[integration.category]) {
      acc[integration.category] = [];
    }
    acc[integration.category].push(integration);
    return acc;
  }, {} as Record<string, Integration[]>);

  // Render provider-specific config pages
  if (currentView.type === "stripe") return <StripeConfig onBack={goBack} />;
  if (currentView.type === "visa_direct") return <VisaDirectConfig onBack={goBack} />;
  if (currentView.type === "mobile_money") return <MobileMoneyConfig onBack={goBack} provider={currentView.provider} />;
  if (currentView.type === "compliance") return <ComplianceConfig onBack={goBack} provider={currentView.provider} />;
  if (currentView.type === "banking") return <BankingConfig onBack={goBack} provider={currentView.provider} />;
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

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-indigo-600">
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
                      checked={settingsMap.get(integration.id) ?? integration.enabled}
                      disabled={toggleMutation.isPending}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ key: integration.id, enabled: checked })
                      }
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConfigure(integration.id)}
                    >
                      <Settings2 className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
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
