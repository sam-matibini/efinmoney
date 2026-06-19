import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, Copy, Hash } from "lucide-react";

const ProfileSettingsPage = () => {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [efinTag, setEfinTag] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateProvince, setStateProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      const p = profile as any;
      setFullName(p.full_name || "");
      setEmail(p.email || user?.email || "");
      setEfinTag(p.efin_tag || "");
      setPhoneNumber(p.phone_number || "");
      setStreetAddress(p.street_address || "");
      setCity(p.city || "");
      setStateProvince(p.state_province || "");
      setPostalCode(p.postal_code || "");
      setAddressCountry(p.address_country || p.country_code || "");
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
        .update({
          full_name: fullName,
          email,
          efin_tag: cleanTag || null,
          phone_number: phoneNumber || null,
          street_address: streetAddress || null,
          city: city || null,
          state_province: stateProvince || null,
          postal_code: postalCode || null,
          address_country: addressCountry ? addressCountry.toUpperCase().slice(0, 2) : null,
        })
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
    <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Profile Settings</h1>

        {/* eFinMoney identity card — what others use to send you money */}
        <Card className="p-6 mb-4 space-y-4 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Your eFinMoney identity</p>
            <p className="text-sm text-muted-foreground mt-1">
              Share either of these so other eFinMoney users can send you money instantly.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground mb-1">
                <Hash className="w-3.5 h-3.5" /> Account number
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-display font-bold tracking-wide truncate">
                  {(profile as any)?.account_number || "—"}
                </p>
                {(profile as any)?.account_number && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText((profile as any).account_number);
                      toast.success("Account number copied");
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground mb-1">
                <AtSign className="w-3.5 h-3.5" /> eFin tag
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-display font-bold truncate">
                  {(profile as any)?.efin_tag ? `@${(profile as any).efin_tag}` : "Not set"}
                </p>
                {(profile as any)?.efin_tag && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(`@${(profile as any).efin_tag}`);
                      toast.success("Tag copied");
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

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

          <div className="pt-4 border-t border-border space-y-1">
            <h2 className="font-display font-semibold">Billing address</h2>
            <p className="text-xs text-muted-foreground">
              Required for card issuance (Visa/Mastercard). Must match a verifiable residential address.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1 555 123 4567" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="street">Street address</Label>
            <Input id="street" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State / Province</Label>
              <Input id="state" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="ON" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="postal">Postal code</Label>
              <Input id="postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="M5V 2T6" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country (ISO-2)</Label>
              <Input
                id="country"
                value={addressCountry}
                onChange={(e) => setAddressCountry(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="CA"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving || isLoading}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>

        </Card>
    </div>
  );
};

export default ProfileSettingsPage;
