import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign } from "lucide-react";

const ProfileSettingsPage = () => {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [efinTag, setEfinTag] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setEmail(profile.email || user?.email || "");
      setEfinTag((profile as any).efin_tag || "");
    }
  }, [profile, user]);

  const handleSave = async () => {
    if (!user) return;
    const cleanTag = efinTag.trim().replace(/^@/, "");
    if (cleanTag && !/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(cleanTag)) {
      toast.error("@tag must be 3-20 chars, start with a letter, letters/numbers/_ only");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, email, efin_tag: cleanTag || null })
        .eq('user_id', user.id);
      if (error) {
        if (error.message.includes('duplicate') || error.code === '23505') {
          throw new Error(`@${cleanTag} is already taken`);
        }
        throw error;
      }

      if (email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email });
        if (emailError) throw emailError;
        toast.success("Profile updated. Check your inbox to confirm new email.");
      } else {
        toast.success("Profile updated");
      }
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Profile Settings</h1>
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Display Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="efinTag">eFinMoney tag</Label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="efinTag"
                value={efinTag}
                onChange={(e) => setEfinTag(e.target.value.replace(/^@/, ""))}
                placeholder="yourname"
                disabled={isLoading}
                className="pl-9"
                maxLength={20}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Your unique handle so other eFinMoney users can send you money instantly. 3–20 chars, letters/numbers/_.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Changing your email requires confirmation via the new address.
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving || isLoading}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default ProfileSettingsPage;
