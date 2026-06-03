import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface VisaDirectConfigProps {
  onBack: () => void;
}

export function VisaDirectConfig({ onBack }: VisaDirectConfigProps) {
  const [showUserId, setShowUserId] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Visa Direct Configuration</h2>
          <p className="text-muted-foreground">Configure real-time push payments to Visa cards</p>
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
              <p className="text-sm text-muted-foreground">Merchant ID</p>
              <p className="font-mono text-sm">VD-123456789</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Program Type</p>
              <p className="text-sm">Original Credit Transaction</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Certificate Expiry</p>
              <p className="text-sm">Dec 15, 2025</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Daily Limit</p>
              <p className="text-sm font-medium">$500,000</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>API Credentials</CardTitle>
          <CardDescription>Visa Developer Platform credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Environment</Label>
            <Select defaultValue="production">
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="certification">Certification</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>User ID</Label>
              <div className="relative">
                <Input 
                  type={showUserId ? "text" : "password"}
                  defaultValue="visa_user_prod_123"
                  className="font-mono text-sm pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowUserId(!showUserId)}
                >
                  {showUserId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input 
                  type={showPassword ? "text" : "password"}
                  defaultValue="••••••••••••"
                  className="font-mono text-sm pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <Label>SSL Certificates</Label>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Client Certificate</span>
                  <Badge variant="outline" className="text-indigo-600">Valid</Badge>
                </div>
                <p className="text-sm text-muted-foreground">client_cert_prod.pem</p>
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" /> Replace Certificate
                </Button>
              </div>
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Private Key</span>
                  <Badge variant="outline" className="text-indigo-600">Valid</Badge>
                </div>
                <p className="text-sm text-muted-foreground">private_key_prod.pem</p>
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" /> Replace Key
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Settings</CardTitle>
          <CardDescription>Configure push payment parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Acquiring BIN</Label>
              <Input defaultValue="408999" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Business Application ID</Label>
              <Select defaultValue="PP">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PP">PP - Person to Person</SelectItem>
                  <SelectItem value="FD">FD - Funds Disbursement</SelectItem>
                  <SelectItem value="GD">GD - Government Disbursement</SelectItem>
                  <SelectItem value="MD">MD - Merchant Disbursement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Source of Funds</Label>
              <Select defaultValue="01">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="01">01 - Debit</SelectItem>
                  <SelectItem value="02">02 - Credit</SelectItem>
                  <SelectItem value="03">03 - Prepaid</SelectItem>
                  <SelectItem value="04">04 - Cash</SelectItem>
                  <SelectItem value="05">05 - Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transaction Currency</Label>
              <Select defaultValue="840">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="840">840 - USD</SelectItem>
                  <SelectItem value="978">978 - EUR</SelectItem>
                  <SelectItem value="826">826 - GBP</SelectItem>
                  <SelectItem value="124">124 - CAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Retrieval Reference Number Prefix</Label>
              <Input defaultValue="VD" maxLength={4} className="font-mono" />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Transaction Limits</Label>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Per Transaction</Label>
                <Input type="number" defaultValue="10000" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Daily Limit</Label>
                <Input type="number" defaultValue="500000" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Monthly Limit</Label>
                <Input type="number" defaultValue="5000000" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance & Risk */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance & Risk Settings</CardTitle>
          <CardDescription>Configure risk management and compliance rules</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[
              { name: "OFAC Screening", description: "Screen recipients against OFAC sanctions list", enabled: true },
              { name: "Velocity Checks", description: "Limit transaction frequency per card", enabled: true },
              { name: "Cross-border Validation", description: "Validate cross-border transaction eligibility", enabled: true },
              { name: "Card Verification", description: "Verify card eligibility before processing", enabled: true },
              { name: "Amount Threshold Alerts", description: "Alert on transactions above $5,000", enabled: false },
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

          <Separator />

          <div className="space-y-2">
            <Label>Blocked Countries (ISO 3166-1 alpha-2)</Label>
            <Textarea 
              defaultValue="KP, IR, CU, SY, SD"
              placeholder="Comma-separated country codes"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Transactions to these countries will be blocked</p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button onClick={() => toast.success("Visa Direct configuration saved!")}>Save Changes</Button>
      </div>
    </div>
  );
}
