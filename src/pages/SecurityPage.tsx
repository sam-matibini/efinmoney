import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, Smartphone } from "lucide-react";

const SecurityPage = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [twoFA, setTwoFA] = useState(false);

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      let loginPath: string | null = null;
      try {
        loginPath = sessionStorage.getItem("efm_post_reset_login");
        if (loginPath) sessionStorage.removeItem("efm_post_reset_login");
      } catch {
        /* noop */
      }

      if (loginPath) {
        await supabase.auth.signOut();
        toast.success("Password updated. Sign in with your new password.");
        navigate(loginPath, { replace: true });
        return;
      }

      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast.error(e.message || "Failed to update password");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Security</h1>
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-5 h-5 text-foreground" />
              <h2 className="font-semibold text-foreground">Change Password</h2>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="newPwd">New Password</Label>
                <Input
                  id="newPwd"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPwd">Confirm Password</Label>
                <Input
                  id="confirmPwd"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button onClick={handlePasswordChange} disabled={updating || !newPassword}>
                {updating ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex gap-3">
                <Smartphone className="w-5 h-5 text-foreground mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-foreground">Two-Factor Authentication</h2>
                    <Badge variant="outline" className="text-[10px]">Coming Soon</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add an extra layer of security with an authenticator app.
                  </p>
                </div>
              </div>
              <Switch
                checked={twoFA}
                onCheckedChange={(v) => {
                  setTwoFA(v);
                  toast.info("2FA setup will be available soon");
                }}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SecurityPage;
