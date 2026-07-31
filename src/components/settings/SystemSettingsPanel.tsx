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

const SaveButton = ({
  label,
  onClick,
  disabled,
  pending,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
}) => (
  <Button onClick={onClick} disabled={disabled}>
    {pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
    {label}
  </Button>
);

const useSectionSave = (section: string) => {
  const { saveSettings } = useSystemSettings();
  const save = async (values: Record<string, unknown>) => {
    try {
      await saveSettings.mutateAsync(values);
      toast({ title: "Settings saved", description: `${section} settings have been updated.` });
    } catch (e) {
      toast({
        title: "Could not save settings",
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      });
    }
  };
  return { save, pending: saveSettings.isPending };
};

const EmailSettingsCard = () => {
  const { getString, getNumber, isLoading } = useSystemSettings();
  const { isAdmin } = useUserRoles();
  const { save, pending } = useSectionSave("Email");

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [footer, setFooter] = useState("© 2024 eFinMoney. All rights reserved.");

  useEffect(() => {
    if (isLoading) return;
    setHost(getString("email.smtp_host", ""));
    setPort(String(getNumber("email.smtp_port", 587)));
    setUser(getString("email.smtp_user", ""));
    setFooter(getString("email.footer_text", "© 2024 eFinMoney. All rights reserved."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Configuration
        </CardTitle>
        <CardDescription>Configure email notification settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtp_host">SMTP Host</Label>
                <Input
                  id="smtp_host"
                  placeholder="smtp.example.com"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_port">SMTP Port</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_user">SMTP Username</Label>
                <Input
                  id="smtp_user"
                  placeholder="username"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label>SMTP Password</Label>
                <Input value="Stored as a backend secret" disabled readOnly />
                <p className="text-xs text-muted-foreground">
                  Passwords are never stored in settings — ask an administrator to update the backend secret.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_footer">Email Footer Text</Label>
              <Textarea
                id="email_footer"
                placeholder="Enter footer text for all outgoing emails..."
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          </>
        )}
        <SaveButton
          label="Save Email Settings"
          pending={pending}
          disabled={!isAdmin || isLoading || pending}
          onClick={() =>
            save({
              "email.smtp_host": host.trim(),
              "email.smtp_port": Number(port) || 587,
              "email.smtp_user": user.trim(),
              "email.footer_text": footer,
            })
          }
        />
      </CardContent>
    </Card>
  );
};

const NotificationSettingsCard = () => {
  const { getBoolean, isLoading } = useSystemSettings();
  const { isAdmin } = useUserRoles();
  const { save, pending } = useSectionSave("Notification");

  const [transactionAlerts, setTransactionAlerts] = useState(true);
  const [complianceAlerts, setComplianceAlerts] = useState(true);
  const [lowBalanceAlerts, setLowBalanceAlerts] = useState(true);
  const [dailySummary, setDailySummary] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    setTransactionAlerts(getBoolean("notifications.transaction_alerts", true));
    setComplianceAlerts(getBoolean("notifications.compliance_alerts", true));
    setLowBalanceAlerts(getBoolean("notifications.low_balance_alerts", true));
    setDailySummary(getBoolean("notifications.daily_summary", false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const rows: { label: string; description: string; value: boolean; set: (v: boolean) => void }[] = [
    {
      label: "Transaction Alerts",
      description: "Send alerts for all transactions",
      value: transactionAlerts,
      set: setTransactionAlerts,
    },
    {
      label: "Compliance Alerts",
      description: "Notify compliance team of flagged transactions",
      value: complianceAlerts,
      set: setComplianceAlerts,
    },
    {
      label: "Low Balance Alerts",
      description: "Alert users when wallet balance is low",
      value: lowBalanceAlerts,
      set: setLowBalanceAlerts,
    },
    {
      label: "Daily Summary Emails",
      description: "Send daily transaction summaries to admins",
      value: dailySummary,
      set: setDailySummary,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </CardTitle>
        <CardDescription>Configure system-wide notification preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <div>
                  <Label>{row.label}</Label>
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                </div>
                <Switch checked={row.value} onCheckedChange={row.set} disabled={!isAdmin} />
              </div>
            ))}
          </div>
        )}
        <SaveButton
          label="Save Notification Settings"
          pending={pending}
          disabled={!isAdmin || isLoading || pending}
          onClick={() =>
            save({
              "notifications.transaction_alerts": transactionAlerts,
              "notifications.compliance_alerts": complianceAlerts,
              "notifications.low_balance_alerts": lowBalanceAlerts,
              "notifications.daily_summary": dailySummary,
            })
          }
        />
      </CardContent>
    </Card>
  );
};

const SecuritySettingsCard = () => {
  const { getBoolean, getNumber, isLoading } = useSystemSettings();
  const { isAdmin } = useUserRoles();
  const { save, pending } = useSectionSave("Security");

  const [require2faAdmin, setRequire2faAdmin] = useState(true);
  const [require2faLarge, setRequire2faLarge] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("30");
  const [maxLoginAttempts, setMaxLoginAttempts] = useState("5");
  const [twofaThreshold, setTwofaThreshold] = useState("5000");
  const [passwordExpiry, setPasswordExpiry] = useState("90");

  useEffect(() => {
    if (isLoading) return;
    setRequire2faAdmin(getBoolean("security.require_2fa_admin", true));
    setRequire2faLarge(getBoolean("security.require_2fa_large_transfers", true));
    setSessionTimeout(String(getNumber("security.session_timeout_minutes", 30)));
    setMaxLoginAttempts(String(getNumber("security.max_login_attempts", 5)));
    setTwofaThreshold(String(getNumber("security.twofa_threshold_usd", 5000)));
    setPasswordExpiry(String(getNumber("security.password_expiry_days", 90)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Security Settings
        </CardTitle>
        <CardDescription>Configure security and authentication settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Require 2FA for Admins</Label>
                <p className="text-sm text-muted-foreground">Force two-factor authentication for admin users</p>
              </div>
              <Switch checked={require2faAdmin} onCheckedChange={setRequire2faAdmin} disabled={!isAdmin} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Require 2FA for Large Transfers</Label>
                <p className="text-sm text-muted-foreground">Require 2FA for transfers above threshold</p>
              </div>
              <Switch checked={require2faLarge} onCheckedChange={setRequire2faLarge} disabled={!isAdmin} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="session_timeout">Session Timeout (minutes)</Label>
                <Input
                  id="session_timeout"
                  type="number"
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_login_attempts">Max Login Attempts</Label>
                <Input
                  id="max_login_attempts"
                  type="number"
                  value={maxLoginAttempts}
                  onChange={(e) => setMaxLoginAttempts(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twofa_threshold">2FA Transfer Threshold (USD)</Label>
                <Input
                  id="twofa_threshold"
                  type="number"
                  value={twofaThreshold}
                  onChange={(e) => setTwofaThreshold(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password_expiry">Password Expiry (days)</Label>
                <Input
                  id="password_expiry"
                  type="number"
                  value={passwordExpiry}
                  onChange={(e) => setPasswordExpiry(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </div>
        )}
        <SaveButton
          label="Save Security Settings"
          pending={pending}
          disabled={!isAdmin || isLoading || pending}
          onClick={() =>
            save({
              "security.require_2fa_admin": require2faAdmin,
              "security.require_2fa_large_transfers": require2faLarge,
              "security.session_timeout_minutes": Number(sessionTimeout) || 30,
              "security.max_login_attempts": Number(maxLoginAttempts) || 5,
              "security.twofa_threshold_usd": Number(twofaThreshold) || 0,
              "security.password_expiry_days": Number(passwordExpiry) || 90,
            })
          }
        />
      </CardContent>
    </Card>
  );
};

const DataSettingsCard = () => {
  const { getBoolean, getNumber, isLoading } = useSystemSettings();
  const { isAdmin } = useUserRoles();
  const { save, pending } = useSectionSave("Data management");

  const [auditRetention, setAuditRetention] = useState("365");
  const [txnRetention, setTxnRetention] = useState("7");
  const [autoBackups, setAutoBackups] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    setAuditRetention(String(getNumber("data.audit_retention_days", 365)));
    setTxnRetention(String(getNumber("data.transaction_retention_years", 7)));
    setAutoBackups(getBoolean("data.auto_backups", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Data Management
        </CardTitle>
        <CardDescription>Data retention and backup settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="audit_retention">Audit Log Retention (days)</Label>
                <Input
                  id="audit_retention"
                  type="number"
                  value={auditRetention}
                  onChange={(e) => setAuditRetention(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transaction_retention">Transaction History Retention (years)</Label>
                <Input
                  id="transaction_retention"
                  type="number"
                  value={txnRetention}
                  onChange={(e) => setTxnRetention(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Automatic Backups</Label>
                <p className="text-sm text-muted-foreground">Enable daily automatic database backups</p>
              </div>
              <Switch checked={autoBackups} onCheckedChange={setAutoBackups} disabled={!isAdmin} />
            </div>
          </>
        )}
        <SaveButton
          label="Save Data Settings"
          pending={pending}
          disabled={!isAdmin || isLoading || pending}
          onClick={() =>
            save({
              "data.audit_retention_days": Number(auditRetention) || 365,
              "data.transaction_retention_years": Number(txnRetention) || 7,
              "data.auto_backups": autoBackups,
            })
          }
        />
      </CardContent>
    </Card>
  );
};

export const SystemSettingsPanel = () => {
  return (
    <div className="space-y-6">
      <GeneralSettingsCard />
      <EmailSettingsCard />
      <NotificationSettingsCard />
      <SecuritySettingsCard />
      <DataSettingsCard />
    </div>
  );
};
