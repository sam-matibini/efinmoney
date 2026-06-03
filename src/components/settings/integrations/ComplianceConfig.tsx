import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, CheckCircle2, XCircle, Shield, FileCheck, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ComplianceConfigProps {
  onBack: () => void;
  provider: "chainalysis" | "onfido" | "sumsub";
}

const providerConfig = {
  chainalysis: {
    name: "Chainalysis",
    description: "Blockchain compliance and investigation platform",
    icon: <Shield className="h-6 w-6" />,
    status: "connected" as const,
    features: ["Transaction Screening", "Wallet Monitoring", "VASP Due Diligence", "Reactor Investigation"],
  },
  onfido: {
    name: "Onfido",
    description: "AI-powered identity verification",
    icon: <FileCheck className="h-6 w-6" />,
    status: "connected" as const,
    features: ["Document Verification", "Facial Biometrics", "Liveness Detection", "Watchlist Screening"],
  },
  sumsub: {
    name: "Sumsub",
    description: "All-in-one verification platform",
    icon: <Users className="h-6 w-6" />,
    status: "disconnected" as const,
    features: ["KYC Verification", "AML Screening", "Video Verification", "Fraud Prevention"],
  },
};

export function ComplianceConfig({ onBack, provider }: ComplianceConfigProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [riskThreshold, setRiskThreshold] = useState([70]);
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
            {config.status === "connected" ? (
              <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="h-3 w-3 mr-1" /> Disconnected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">API Version</p>
              <p className="font-mono text-sm">v3.0</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Checks This Month</p>
              <p className="text-sm font-medium">2,847</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Pass Rate</p>
              <p className="text-sm font-medium text-indigo-600">94.2%</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Avg Response Time</p>
              <p className="text-sm">1.8s</p>
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
              <Label>API Key</Label>
              <div className="relative">
                <Input 
                  type={showApiKey ? "text" : "password"}
                  placeholder="Enter API key"
                  defaultValue={config.status === "connected" ? "api_xxxxxxxxxxxxx" : ""}
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
              <Label>API Secret</Label>
              <Input 
                type="password"
                placeholder="Enter API secret"
                defaultValue={config.status === "connected" ? "••••••••••••" : ""}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Webhook Secret</Label>
            <Input 
              type="password"
              placeholder="Enter webhook secret"
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Verification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Settings</CardTitle>
          <CardDescription>Configure verification rules and thresholds</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <Label>Risk Score Threshold</Label>
                <span className="text-sm font-medium">{riskThreshold[0]}%</span>
              </div>
              <Slider
                value={riskThreshold}
                onValueChange={setRiskThreshold}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Users with risk scores above this threshold will be flagged for manual review
              </p>
            </div>
          </div>

          <Separator />

          {provider === "chainalysis" && (
            <div className="space-y-3">
              <Label>Blockchain Networks</Label>
              <div className="grid gap-2 md:grid-cols-3">
                {["Bitcoin", "Ethereum", "Tron", "Polygon", "Solana", "Avalanche"].map((chain) => (
                  <div key={chain} className="flex items-center justify-between p-3 border rounded">
                    <span className="text-sm">{chain}</span>
                    <Switch defaultChecked={["Bitcoin", "Ethereum", "Tron"].includes(chain)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {(provider === "onfido" || provider === "sumsub") && (
            <>
              <div className="space-y-3">
                <Label>Document Types</Label>
                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    { name: "Passport", enabled: true },
                    { name: "National ID Card", enabled: true },
                    { name: "Driver's License", enabled: true },
                    { name: "Residence Permit", enabled: false },
                    { name: "Visa", enabled: false },
                    { name: "Work Permit", enabled: false },
                  ].map((doc) => (
                    <div key={doc.name} className="flex items-center justify-between p-3 border rounded">
                      <span className="text-sm">{doc.name}</span>
                      <Switch defaultChecked={doc.enabled} />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Verification Checks</Label>
                {[
                  { name: "Document Authenticity", description: "Verify document is genuine and unaltered", enabled: true },
                  { name: "Facial Match", description: "Compare selfie to document photo", enabled: true },
                  { name: "Liveness Detection", description: "Ensure user is physically present", enabled: true },
                  { name: "Age Verification", description: "Confirm user meets minimum age requirement", enabled: true },
                  { name: "Address Verification", description: "Verify proof of address documents", enabled: false },
                  { name: "Video Identification", description: "Live video call for verification", enabled: false },
                ].map((check) => (
                  <div key={check.name} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">{check.name}</p>
                      <p className="text-sm text-muted-foreground">{check.description}</p>
                    </div>
                    <Switch defaultChecked={check.enabled} />
                  </div>
                ))}
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-3">
            <Label>Screening Lists</Label>
            {[
              { name: "Sanctions Lists", description: "OFAC, EU, UN sanctions lists", enabled: true },
              { name: "PEP Screening", description: "Politically Exposed Persons", enabled: true },
              { name: "Adverse Media", description: "Negative news and media mentions", enabled: true },
              { name: "Watchlists", description: "Global law enforcement watchlists", enabled: true },
              { name: "Custom Blocklist", description: "Your organization's blocklist", enabled: false },
            ].map((list) => (
              <div key={list.name} className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">{list.name}</p>
                  <p className="text-sm text-muted-foreground">{list.description}</p>
                </div>
                <Switch defaultChecked={list.enabled} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Workflow Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow Settings</CardTitle>
          <CardDescription>Configure verification flow and automation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Verification Expiry (days)</Label>
              <Input type="number" defaultValue="365" />
              <p className="text-xs text-muted-foreground">Users must re-verify after this period</p>
            </div>
            <div className="space-y-2">
              <Label>Max Retry Attempts</Label>
              <Input type="number" defaultValue="3" />
              <p className="text-xs text-muted-foreground">Maximum verification attempts per user</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            {[
              { name: "Auto-Approve Low Risk", description: "Automatically approve users with low risk scores", enabled: true },
              { name: "Require Manual Review", description: "All verifications require manual approval", enabled: false },
              { name: "Email Notifications", description: "Send email updates on verification status", enabled: true },
              { name: "Webhook Notifications", description: "Send webhook events for status changes", enabled: true },
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

      {/* Callback Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Callback Configuration</CardTitle>
          <CardDescription>Configure webhook endpoints for verification events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input 
              defaultValue={`https://api.yourapp.com/webhooks/${provider}`}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Redirect URL (Success)</Label>
            <Input 
              defaultValue="https://yourapp.com/verification/success"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Redirect URL (Failure)</Label>
            <Input 
              defaultValue="https://yourapp.com/verification/failed"
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
