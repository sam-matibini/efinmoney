import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, Copy, Hash, User, Check, ChevronsUpDown, Lock } from "lucide-react";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { normalizeToE164 } from "@/lib/phone";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ISO_COUNTRIES, findIsoCountry } from "@/lib/isoCountries";
import {
  interacEmailRejectedReason,
  isCanadianProfile,
  parseInteracEmail,
} from "@/lib/cadInteracPayout";
import { isIgnorableInteracEmailPersistError } from "@/lib/postgrestErrors";

const ProfileSettingsPage = () => {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [interacEmail, setInteracEmail] = useState("");
  const [efinTag, setEfinTag] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [occupation, setOccupation] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateProvince, setStateProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailOptOut, setEmailOptOut] = useState(false);

  /** Once identity is verified, legal name / DOB / phone / address are staff-only edits. */
  const identityLocked = profile?.kyc_status === "verified";

  useEffect(() => {
    if (profile) {
      const p = profile as any;
      setFullName(p.full_name || "");
      setEmail(p.email || user?.email || "");
      setInteracEmail(
        p.interac_email
        || String((user?.user_metadata as { interac_email?: string } | undefined)?.interac_email || "")
        || "",
      );
      setEfinTag(p.efin_tag || "");
      setPhoneNumber(p.phone_number || "");
      setDateOfBirth(p.date_of_birth || "");
      setOccupation(p.occupation || "");
      setStreetAddress(p.street_address || "");
      setCity(p.city || "");
      setStateProvince(p.state_province || "");
      setPostalCode(p.postal_code || "");
      setAddressCountry(p.address_country || p.country_code || "");
      setEmailOptOut(!!p.email_opt_out);
    }
  }, [profile, user]);

  const toggleEmailOptOut = async (optOut: boolean) => {
    if (!user) return;
    setEmailOptOut(optOut);
    const { error } = await (supabase.from("profiles") as any).update({ email_opt_out: optOut }).eq("user_id", user.id);
    if (error) {
      setEmailOptOut(!optOut);
      toast.error("Couldn't update email preferences");
    } else {
      toast.success(optOut ? "Unsubscribed from announcement emails" : "Subscribed to announcement emails");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const cleanTag = efinTag.trim().replace(/^@/, "");
    if (cleanTag && !/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(cleanTag)) {
      toast.error("@tag must be 3-20 chars, start with a letter, letters/numbers/_ only");
      return;
    }
    const canadian = isCanadianProfile({
      address_country: addressCountry || (profile as any)?.address_country,
      country_code: (profile as any)?.country_code,
      default_currency: (profile as any)?.default_currency,
    });
    const loginEmail = (email || user.email || "").trim().toLowerCase();
    const cleanedInterac = parseInteracEmail(interacEmail);
    if (interacEmail.trim() && !cleanedInterac) {
      toast.error("Enter a valid Interac Autodeposit email.");
      return;
    }
    if (cleanedInterac) {
      const conflict = interacEmailRejectedReason(cleanedInterac, [loginEmail]);
      if (conflict) {
        toast.error(conflict);
        return;
      }
    } else if (canadian && interacEmail.trim()) {
      toast.error("Enter a valid Interac Autodeposit email.");
      return;
    }

    setSaving(true);
    try {
      const country = addressCountry
        ? addressCountry.toUpperCase().slice(0, 2)
        : (profile as any)?.address_country ?? (profile as any)?.country_code ?? null;
      let normalizedPhone: string | null = null;
      if (phoneNumber.trim()) {
        normalizedPhone = normalizeToE164(phoneNumber.trim(), country);
        if (!normalizedPhone && phoneNumber.trim().startsWith("+")) {
          normalizedPhone = phoneNumber.trim().replace(/[\s\-()]/g, "");
        }
        if (!normalizedPhone) {
          toast.error(
            country
              ? "Use +… international format or a local number starting with 0 for your country."
              : "Use +… international format, or set Country (ISO-2) on your profile first.",
          );
          setSaving(false);
          return;
        }
      }

      const identityFields = identityLocked
        ? {}
        : {
            full_name: fullName,
            phone_number: normalizedPhone,
            date_of_birth: dateOfBirth || null,
            occupation: occupation || null,
            street_address: streetAddress || null,
            city: city || null,
            state_province: stateProvince || null,
            postal_code: postalCode || null,
            address_country: addressCountry ? addressCountry.toUpperCase().slice(0, 2) : null,
          };

      const { error } = await supabase
        .from('profiles')
        .update({
          email,
          efin_tag: cleanTag || null,
          ...identityFields,
        })
        .eq('user_id', user.id);

      if (error) {
        if (error.message.includes('duplicate') || error.code === '23505') {
          throw new Error(`@${cleanTag} is already taken`);
        }
        throw error;
      }

      const { error: metaErr } = await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata || {}),
          interac_email: cleanedInterac,
        },
      });
      if (metaErr) {
        console.warn("Could not store Interac email on the session:", metaErr.message);
      }

      const { error: colErr } = await supabase
        .from("profiles")
        .update({ interac_email: cleanedInterac })
        .eq("user_id", user.id);
      if (colErr) {
        if (colErr.message.includes("duplicate") || colErr.code === "23505") {
          throw new Error("That Interac email is already used on another account.");
        }
        const { error: rpcErr } = await supabase.rpc("update_own_interac_email", {
          p_email: cleanedInterac ?? "",
        });
        if (rpcErr && !isIgnorableInteracEmailPersistError(colErr) && !isIgnorableInteracEmailPersistError(rpcErr)) {
          if (rpcErr.message.includes("duplicate") || rpcErr.code === "23505") {
            throw new Error("That Interac email is already used on another account.");
          }
          throw rpcErr;
        }
      }

      if (email !== user.email) {
        // Route the change through our branded Edge Function so the
        // "Confirm your new email" message matches the rest of the
        // eFinMoney transactional flow instead of using Supabase's
        // stock template. (No current_password re-prompt — the form
        // is gated by the active session, and adding a re-prompt here
        // is out of scope.)
        const { data: changeData, error: changeError } = await supabase.functions.invoke(
          "send-email-change",
          { body: { new_email: email, next: "/profile" } },
        );
        if (changeError) throw changeError;
        const errBody = (changeData as { error?: string } | null) ?? null;
        if (errBody?.error) throw new Error(errBody.error);
        toast.success("Profile updated. Check your new email inbox to confirm the change.");
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
    <AppPage width="narrow" className="py-8" innerClassName="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Profile Settings</h1>

        <PageHeroBanner
          icon={User}
          label="Signed in as"
          value={fullName || profile?.full_name || user?.email || "Your profile"}
          meta={[
            { icon: AtSign, text: (profile as any)?.efin_tag ? `@${(profile as any).efin_tag}` : "Set your eFin tag below" },
            { icon: Hash, text: (profile as any)?.account_number ? `Acct ${(profile as any).account_number}` : "Account number pending" },
          ]}
          variant="primary"
        />

        <Card className="p-6 mb-4">
          <AvatarUpload />
        </Card>

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
          {identityLocked && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <Lock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Your identity has been verified. Legal name, date of birth, phone and address can only be changed by
                support — contact us to request a correction. Your tag, login email, Interac email and avatar remain editable.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="fullName">Display Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading || identityLocked}
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
              Changing your email requires confirmation via the new address. This is your login — not the Interac Autodeposit address Nomba uses for CAD payouts.
            </p>
          </div>

          {isCanadianProfile({
            address_country: addressCountry || profile?.address_country,
            country_code: profile?.country_code,
            default_currency: profile?.default_currency,
          }) && (
            <div className="space-y-2">
              <Label htmlFor="interacEmail">Interac e-Transfer email</Label>
              <Input
                id="interacEmail"
                type="email"
                value={interacEmail}
                onChange={(e) => setInteracEmail(e.target.value)}
                placeholder="you@personalmail.com"
                disabled={isLoading}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Autodeposit address Nomba uses to pay you in CAD. Must be different from your eFinMoney login email above — using the same mailbox causes Nomba Interac errors.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border space-y-1">
            <h2 className="font-display font-semibold">Billing address</h2>
            <p className="text-xs text-muted-foreground">
              Required for card issuance (Visa/Mastercard). Must match a verifiable residential address.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={isLoading || identityLocked}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="Software engineer"
                maxLength={120}
                disabled={isLoading || identityLocked}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+234 806 860 8302" disabled={isLoading || identityLocked} />
            <p className="text-xs text-muted-foreground">
              Use + and country code (+1, +234, +44…). Local 0… numbers convert using Country below (NG→+234, CA→+1).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="street">Street address</Label>
            <Input id="street" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} placeholder="123 Main St" disabled={isLoading || identityLocked} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} disabled={isLoading || identityLocked} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State / Province</Label>
              <Input id="state" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="ON" disabled={isLoading || identityLocked} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="postal">Postal code</Label>
              <Input id="postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="M5V 2T6" disabled={isLoading || identityLocked} />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={countryOpen}
                    disabled={isLoading || identityLocked}
                    className="w-full justify-between font-normal"
                  >
                    {findIsoCountry(addressCountry) ? (
                      <span className="inline-flex items-center gap-2 truncate">
                        <span className="text-lg leading-none">{findIsoCountry(addressCountry)!.flag}</span>
                        <span className="truncate">{findIsoCountry(addressCountry)!.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select country</span>
                    )}
                    <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]"
                >
                  <Command>
                    <CommandInput placeholder="Search country..." />
                    <CommandList>
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        {ISO_COUNTRIES.map((c) => (
                          <CommandItem
                            key={c.code}
                            value={c.name}
                            onSelect={() => {
                              setAddressCountry(c.code);
                              setCountryOpen(false);
                            }}
                          >
                            <span className="text-lg leading-none mr-2">{c.flag}</span>
                            <span className="flex-1 truncate">{c.name}</span>
                            <Check
                              className={cn(
                                "w-4 h-4 ml-2",
                                addressCountry === c.code ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving || isLoading}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>

        </Card>

        {/* Email preferences */}
        <Card className="p-6 mb-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Email preferences</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Announcement emails</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Product news and updates. Turning this off won't affect important account, security, or transaction emails.
              </p>
            </div>
            <Switch checked={!emailOptOut} onCheckedChange={(on) => toggleEmailOptOut(!on)} disabled={isLoading} />
          </div>
        </Card>
    </AppPage>
  );
};

export default ProfileSettingsPage;
