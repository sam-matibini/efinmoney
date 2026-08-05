import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ChevronLeft, ChevronRight, UserPlus, Check } from "lucide-react";
import CountrySelect from "@/components/inputs/CountrySelect";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { supabase } from "@/integrations/supabase/client";

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  countryCode: string;
  dateOfBirth: string;
  streetAddress: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  addressCountry: string;
  sendInviteEmail: boolean;
}

const STEPS = ["Identity", "Address", "Review"] as const;

const initial: FormData = {
  fullName: "",
  email: "",
  phone: "",
  countryCode: "",
  dateOfBirth: "",
  streetAddress: "",
  city: "",
  stateProvince: "",
  postalCode: "",
  addressCountry: "",
  sendInviteEmail: true,
};

const OnboardUserPage = () => {
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initial);

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) => setForm((f) => ({ ...f, [k]: v }));

  const step1Valid = !!form.fullName.trim() && !!form.email.trim() && /^\S+@\S+\.\S+$/.test(form.email);
  const step2Valid = !!form.streetAddress.trim() && !!form.city.trim() && !!form.addressCountry.trim();
  const canProceed = step === 0 ? step1Valid : step === 1 ? step2Valid : true;

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          phoneNumber: form.phone.trim() || undefined,
          countryCode: form.countryCode.trim().toUpperCase() || undefined,
          kycStatus: "pending",
          kycTier: "tier_0",
          onboardedByAdminId: admin!.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { user_id: string };
    },
    onSuccess: () => {
      const invitedEmail = form.email;
      // Reset form so the wizard is clean if the admin returns to onboard another user
      setForm(initial);
      setStep(0);
      toast.success(`Invitation sent to ${invitedEmail}`);
      navigate("/admin/developer");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not create user");
    },
  });

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
            <UserPlus className="w-7 h-7 text-primary" /> Onboard User
          </h1>
          <p className="text-sm text-muted-foreground">
            The user starts at <span className="font-mono">kyc_tier=0</span> and completes KYC themselves after claiming the invite.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold " +
                  (i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                    ? "bg-primary/20 text-primary border-2 border-primary"
                    : "bg-muted text-muted-foreground")
                }
              >
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={"text-sm " + (i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/40 mx-1" />}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step]}</CardTitle>
            <CardDescription>
              {step === 0 && "Basic identity and contact details."}
              {step === 1 && "Where the user lives."}
              {step === 2 && "Confirm and send the invite."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Full name *</Label>
                    <Input
                      id="fullName"
                      value={form.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="jane@example.com"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 000 0000" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="countryCode">Country</Label>
                    <CountrySelect
                      id="countryCode"
                      value={form.countryCode}
                      onValueChange={(v) => set("countryCode", v)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dob">Date of birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={form.dateOfBirth}
                      max={new Date().toISOString().split("T")[0]}
                      onChange={(e) => set("dateOfBirth", e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="streetAddress">Street address *</Label>
                  <Input
                    id="streetAddress"
                    value={form.streetAddress}
                    onChange={(e) => set("streetAddress", e.target.value)}
                    placeholder="123 Main St, Apt 4B"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="city">City *</Label>
                    <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="stateProvince">State / Province</Label>
                    <Input id="stateProvince" value={form.stateProvince} onChange={(e) => set("stateProvince", e.target.value)} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode">Postal code</Label>
                    <Input id="postalCode" value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="addressCountry">Country *</Label>
                    <CountrySelect
                      id="addressCountry"
                      value={form.addressCountry}
                      onValueChange={(v) => set("addressCountry", v)}
                    />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 py-2 border-b">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{form.fullName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 py-2 border-b">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{form.email}</span>
                </div>
                {form.phone && (
                  <div className="grid grid-cols-2 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium">{form.phone}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 py-2 border-b">
                  <span className="text-muted-foreground">Address</span>
                  <span className="font-medium">
                    {form.streetAddress}, {form.city}
                    {form.stateProvince ? `, ${form.stateProvince}` : ""} {form.postalCode} {form.addressCountry}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 py-2 border-b">
                  <span className="text-muted-foreground">KYC tier</span>
                  <span className="font-mono">tier_0 (user completes)</span>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="sendInvite"
                    checked={form.sendInviteEmail}
                    onCheckedChange={(c) => set("sendInviteEmail", !!c)}
                  />
                  <Label htmlFor="sendInvite" className="text-sm font-normal">
                    Send invite email to {form.email}
                  </Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => (step === 0 ? navigate("/admin/developer") : setStep(step - 1))}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || !form.sendInviteEmail}
            >
              {submit.isPending && <LoadingSpinner size={16} className="mr-2" />}
              Send invite
            </Button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default OnboardUserPage;
