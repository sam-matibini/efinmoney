import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";
import { 
  Shield, 
  Wallet, 
  CreditCard, 
  ArrowLeftRight, 
  Users, 
  FileText,
  Settings,
  Building2,
  TrendingUp,
  AlertTriangle,
  Save
} from "lucide-react";

interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  requiredRoles: string[];
}

export const ModuleAccessPanel = () => {
  const [modules, setModules] = useState<ModuleConfig[]>([
    {
      id: 'wallets',
      name: 'Wallets',
      description: 'Multi-currency wallet management',
      icon: Wallet,
      enabled: true,
      requiredRoles: ['user'],
    },
    {
      id: 'transfers',
      name: 'Money Transfers',
      description: 'Send money domestically and internationally',
      icon: ArrowLeftRight,
      enabled: true,
      requiredRoles: ['user'],
    },
    {
      id: 'fx_trading',
      name: 'FX Trading',
      description: 'Currency exchange functionality',
      icon: TrendingUp,
      enabled: true,
      requiredRoles: ['user'],
    },
    {
      id: 'crypto_trading',
      name: 'Crypto Trading',
      description: 'Cryptocurrency buy/sell functionality',
      icon: CreditCard,
      enabled: true,
      requiredRoles: ['user'],
    },
    {
      id: 'cards',
      name: 'Virtual Cards',
      description: 'Issue and manage virtual cards',
      icon: CreditCard,
      enabled: false,
      requiredRoles: ['user'],
    },
    {
      id: 'finance',
      name: 'Finance Dashboard',
      description: 'Accounting, banking, and financial management',
      icon: Building2,
      enabled: true,
      requiredRoles: ['admin', 'finance'],
    },
    {
      id: 'operations',
      name: 'Operations Dashboard',
      description: 'CRM, monitoring, and dispute management',
      icon: Settings,
      enabled: true,
      requiredRoles: ['admin', 'finance', 'compliance'],
    },
    {
      id: 'admin',
      name: 'Admin Dashboard',
      description: 'User management and system configuration',
      icon: Shield,
      enabled: true,
      requiredRoles: ['admin'],
    },
    {
      id: 'compliance',
      name: 'Compliance Module',
      description: 'AML/KYC monitoring and regulatory reporting',
      icon: AlertTriangle,
      enabled: true,
      requiredRoles: ['admin', 'compliance'],
    },
    {
      id: 'customer_portal',
      name: 'Customer Portal',
      description: 'Self-service portal for customers',
      icon: Users,
      enabled: true,
      requiredRoles: [],
    },
    {
      id: 'reports',
      name: 'Reports Centre',
      description: 'Financial reporting and analytics',
      icon: FileText,
      enabled: true,
      requiredRoles: ['admin', 'finance'],
    },
  ]);

  const { getBoolean, isLoading, saveSettings } = useSystemSettings();
  const { isAdmin } = useUserRoles();

  useEffect(() => {
    if (isLoading) return;
    setModules(prev =>
      prev.map(module => ({
        ...module,
        enabled: getBoolean(`modules.${module.id}.enabled`, module.enabled),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleToggleModule = (moduleId: string) => {
    setModules(prev => prev.map(module => 
      module.id === moduleId ? { ...module, enabled: !module.enabled } : module
    ));
  };

  const handleSave = async () => {
    try {
      await saveSettings.mutateAsync(
        Object.fromEntries(modules.map(m => [`modules.${m.id}.enabled`, m.enabled])),
      );
      toast.success("Module access settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save module access settings");
    }
  };


  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'finance': return 'default';
      case 'compliance': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Module Access Control
          </CardTitle>
          <CardDescription>
            Enable or disable modules and configure role-based access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {modules.map((module) => (
              <div 
                key={module.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <module.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={module.id} className="font-medium">
                        {module.name}
                      </Label>
                      {!module.enabled && (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                    <div className="flex gap-1 mt-1">
                      {module.requiredRoles.length === 0 ? (
                        <Badge variant="outline">Public</Badge>
                      ) : (
                        module.requiredRoles.map(role => (
                          <Badge key={role} variant={getRoleBadgeVariant(role)}>
                            {role}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <Switch
                  id={module.id}
                  checked={module.enabled}
                  onCheckedChange={() => handleToggleModule(module.id)}
                  disabled={!isAdmin || isLoading}
                />
              </div>
            ))}
          </div>
          <Button onClick={handleSave} className="mt-6" disabled={!isAdmin || isLoading || saveSettings.isPending}>
            {saveSettings.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
          {!isAdmin && (
            <p className="mt-2 text-xs text-muted-foreground">Only administrators can change module access.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
