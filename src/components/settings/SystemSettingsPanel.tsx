import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Globe, 
  Mail, 
  Bell, 
  Lock, 
  Database,
  Save,
  Loader2
} from "lucide-react";
import { SYSTEM_DEFAULT_CURRENCY, SYSTEM_TIMEZONE } from "@/lib/systemDefaults";
import { systemTzLabel } from "@/lib/datetime";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "@/hooks/use-toast";

const GeneralSettingsCard = () => {
  const { getString, isLoading, saveSettings } = useSystemSettings();
  const { isAdmin } = useUserRoles();

  const [companyName, setCompanyName] = useState("eFinMoney");
  const [supportEmail, setSupportEmail] = useState("support@efinmoney.com");
  const [currency, setCurrency] = useState(SYSTEM_DEFAULT_CURRENCY);
  const [timezone, setTimezone] = useState(SYSTEM_TIMEZONE);

  useEffect(() => {
    if (isLoading) return;
    setCompanyName(getString("general.company_name", "eFinMoney"));
    setSupportEmail(getString("general.support_email", "support@efinmoney.com"));
    setCurrency(getString("general.default_currency", SYSTEM_DEFAULT_CURRENCY));
    setTimezone(getString("general.default_timezone", SYSTEM_TIMEZONE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleSave = async () => {
    try {
      await saveSettings.mutateAsync({
        "general.company_name": companyName.trim(),
        "general.support_email": supportEmail.trim(),
        "general.default_currency": currency,
        "general.default_timezone": timezone,
      });
      toast({ title: "Settings saved", description: "General settings have been updated." });
    } catch (e) {
      toast({
        title: "Could not save settings",
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          General Settings
        </CardTitle>
        <CardDescription>Configure basic system settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support_email">Support Email</Label>
              <Input
                id="support_email"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_currency">Default Currency</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={!isAdmin}>
                <SelectTrigger id="default_currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                  <SelectItem value="BWP">BWP - Botswana Pula</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Users' base currency follows their domicile country; this is the platform fallback.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Default Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone} disabled={!isAdmin}>
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Chicago">Central Time (CST/CDT)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/Toronto">Eastern Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                  <SelectItem value="Africa/Lagos">Lagos</SelectItem>
                  <SelectItem value="Africa/Gaborone">Gaborone</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                System records use {systemTzLabel()}. Customers see times in their own timezone (detected from their device or IP).
              </p>
            </div>
          </div>
        )}
        <Button onClick={handleSave} disabled={!isAdmin || isLoading || saveSettings.isPending}>
          {saveSettings.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save General Settings
        </Button>
        {!isAdmin && (
          <p className="text-xs text-muted-foreground">Only administrators can change these settings.</p>
        )}
      </CardContent>
    </Card>
  );
};

export const SystemSettingsPanel = () => {
  return (
    <div className="space-y-6">
      {/* General Settings */}
      <GeneralSettingsCard />


      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Configuration
          </CardTitle>
          <CardDescription>Configure email notification settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input id="smtp_host" placeholder="smtp.example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">SMTP Port</Label>
              <Input id="smtp_port" type="number" defaultValue="587" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_user">SMTP Username</Label>
              <Input id="smtp_user" placeholder="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_pass">SMTP Password</Label>
              <Input id="smtp_pass" type="password" placeholder="••••••••" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email_footer">Email Footer Text</Label>
            <Textarea 
              id="email_footer" 
              placeholder="Enter footer text for all outgoing emails..."
              defaultValue="© 2024 eFinMoney. All rights reserved."
            />
          </div>
          <Button>
            <Save className="h-4 w-4 mr-2" />
            Save Email Settings
          </Button>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>Configure system-wide notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Transaction Alerts</Label>
                <p className="text-sm text-muted-foreground">Send alerts for all transactions</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Compliance Alerts</Label>
                <p className="text-sm text-muted-foreground">Notify compliance team of flagged transactions</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Low Balance Alerts</Label>
                <p className="text-sm text-muted-foreground">Alert users when wallet balance is low</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Daily Summary Emails</Label>
                <p className="text-sm text-muted-foreground">Send daily transaction summaries to admins</p>
              </div>
              <Switch />
            </div>
          </div>
          <Button>
            <Save className="h-4 w-4 mr-2" />
            Save Notification Settings
          </Button>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Security Settings
          </CardTitle>
          <CardDescription>Configure security and authentication settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Require 2FA for Admins</Label>
                <p className="text-sm text-muted-foreground">Force two-factor authentication for admin users</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Require 2FA for Large Transfers</Label>
                <p className="text-sm text-muted-foreground">Require 2FA for transfers above threshold</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="session_timeout">Session Timeout (minutes)</Label>
                <Input id="session_timeout" type="number" defaultValue="30" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_login_attempts">Max Login Attempts</Label>
                <Input id="max_login_attempts" type="number" defaultValue="5" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="2fa_threshold">2FA Transfer Threshold (USD)</Label>
                <Input id="2fa_threshold" type="number" defaultValue="5000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password_expiry">Password Expiry (days)</Label>
                <Input id="password_expiry" type="number" defaultValue="90" />
              </div>
            </div>
          </div>
          <Button>
            <Save className="h-4 w-4 mr-2" />
            Save Security Settings
          </Button>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Management
          </CardTitle>
          <CardDescription>Data retention and backup settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="audit_retention">Audit Log Retention (days)</Label>
              <Input id="audit_retention" type="number" defaultValue="365" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transaction_retention">Transaction History Retention (years)</Label>
              <Input id="transaction_retention" type="number" defaultValue="7" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Automatic Backups</Label>
              <p className="text-sm text-muted-foreground">Enable daily automatic database backups</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Button>
            <Save className="h-4 w-4 mr-2" />
            Save Data Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
