import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ChevronLeft, ChevronRight, Briefcase, Check, Plus, X, AlertCircle } from "lucide-react";
import { ISO_COUNTRIES } from "@/lib/isoCountries";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Ubo {
  id: string; // local id for React key
  full_name: string;
  ownership_pct: string;
  voting_pct: string;
  control_pct: string;
  nationality: string;
  dob: string;
  id_document_type: string;
  id_document_number: string;
  address: string;
  pep_status: string;
}

const STEPS = ["Business", "Owner", "UBOs", "Review"] as const;

const newUbo = (): Ubo => ({
  id: crypto.randomUUID(),
  full_name: "",
  ownership_pct: "",
  voting_pct: "",
  control_pct: "",
  nationality: "",
  dob: "",
  id_document_type: "",
  id_document_number: "",
  address: "",
  pep_status: "none",
});

const initialUbos = (): Ubo[] => [newUbo()];

interface FormData {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  taxId: string;
  registrationNumber: string;
  dateOfIncorporation: string;
  industry: string;
  website: string;
  companyType: string;
  riskLevel: string;
  ownerEmail: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerCountryCode: string;
  ubos: Ubo[];
  sendInviteEmail: boolean;
}

const initial: FormData = {
  businessName: "",
  businessEmail: "",
  businessPhone: "",
  businessAddress: "",
  taxId: "",
  registrationNumber: "",
  dateOfIncorporation: "",
  industry: "",
  website: "",
  companyType: "",
  riskLevel: "medium",
  ownerEmail: "",
  ownerFullName: "",
  ownerPhone: "",
  ownerCountryCode: "",
  ubos: initialUbos(),
  sendInviteEmail: true,
};

const OnboardBusinessPage = () => {
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initial);

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) => setForm((f) => ({ ...f, [k]: v }));

  const totals = useMemo(() => {
    const ownership = form.ubos.reduce((s, u) => s + (parseFloat(u.ownership_pct) || 0), 0);
    const voting = form.ubos.reduce((s, u) => s + (parseFloat(u.voting_pct) || 0), 0);
    return { ownership, voting };
  }, [form.ubos]);

  const ubosValid =
    form.ubos.length > 0 &&
    form.ubos.every((u) => u.full_name.trim() && parseFloat(u.ownership_pct) > 0) &&
    Math.abs(totals.ownership - 100) < 0.01 &&
    Math.abs(totals.voting - 100) < 0.01;

  const step1Valid = !!form.businessName.trim();
  const step2Valid = !!form.ownerFullName.trim() && !!form.ownerEmail.trim() && /^\S+@\S+\.\S+$/.test(form.ownerEmail);
  const step3Valid = ubosValid;

  const canProceed = step === 0 ? step1Valid : step === 1 ? step2Valid : step === 2 ? step3Valid : true;

  const updateUbo = (id: string, patch: Partial<Ubo>) => {
    setForm((f) => ({
      ...f,
      ubos: f.ubos.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }));
  };

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-create-business", {
        body: {
          ownerEmail: form.ownerEmail.trim(),
          ownerFullName: form.ownerFullName.trim(),
          ownerPhone: form.ownerPhone.trim() || undefined,
          ownerCountryCode: form.ownerCountryCode.trim().toUpperCase() || undefined,
          businessName: form.businessName.trim(),
          businessEmail: form.businessEmail.trim() || undefined,
          businessPhone: form.businessPhone.trim() || undefined,
          businessAddress: form.businessAddress.trim() || undefined,
          taxId: form.taxId.trim() || undefined,
          registrationNumber: form.registrationNumber.trim() || undefined,
          dateOfIncorporation: form.dateOfIncorporation || undefined,
          industry: form.industry.trim() || undefined,
          website: form.website.trim() || undefined,
          companyType: form.companyType.trim() || undefined,
          riskLevel: form.riskLevel,
          ubos: form.ubos.map((u) => ({
            full_name: u.full_name.trim(),
            ownership_pct: parseFloat(u.ownership_pct) || 0,
            voting_pct: parseFloat(u.voting_pct) || parseFloat(u.ownership_pct) || 0,
            control_pct: parseFloat(u.control_pct) || 0,
            nationality: u.nationality.trim() || undefined,
            dob: u.dob || undefined,
            id_document_type: u.id_document_type || undefined,
            id_document_number: u.id_document_number.trim() || undefined,
            address: u.address.trim() || undefined,
            pep_status: u.pep_status,
          })),
          onboardedByAdminId: admin!.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { user_id: string; customer_id: string };
    },
    onSuccess: () => {
      toast.success(`Business created. Invite sent to ${form.ownerEmail}`);
      navigate("/admin/developer");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not create business");
    },
  });

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-primary" /> Onboard Business
          </h1>
          <p className="text-sm text-muted-foreground">
            The owner claims the invite, then completes KYB. You don't approve it.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
              {step === 0 && "Legal entity information."}
              {step === 1 && "The person who will log in to manage this business."}
              {step === 2 && "Beneficial owners with 25%+ ownership. Totals must each equal 100%."}
              {step === 3 && "Confirm and send the invite."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="businessName">Legal name *</Label>
                    <Input id="businessName" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Acme Corp Inc." />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="companyType">Entity type</Label>
                    <Input id="companyType" value={form.companyType} onChange={(e) => set("companyType", e.target.value)} placeholder="Corporation, LLC, etc." />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="registrationNumber">Registration #</Label>
                    <Input id="registrationNumber" value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="taxId">Tax ID</Label>
                    <Input id="taxId" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dateOfIncorporation">Date of incorporation</Label>
                    <Input id="dateOfIncorporation" type="date" value={form.dateOfIncorporation} onChange={(e) => set("dateOfIncorporation", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="industry">Industry</Label>
                    <Input id="industry" value={form.industry} onChange={(e) => set("industry", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="businessAddress">Registered address</Label>
                  <Input id="businessAddress" value={form.businessAddress} onChange={(e) => set("businessAddress", e.target.value)} />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="businessEmail">Business email</Label>
                    <Input id="businessEmail" type="email" value={form.businessEmail} onChange={(e) => set("businessEmail", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="businessPhone">Business phone</Label>
                    <Input id="businessPhone" value={form.businessPhone} onChange={(e) => set("businessPhone", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="riskLevel">Risk level</Label>
                  <Select value={form.riskLevel} onValueChange={(v) => set("riskLevel", v)}>
                    <SelectTrigger id="riskLevel"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerFullName">Full name *</Label>
                    <Input id="ownerFullName" value={form.ownerFullName} onChange={(e) => set("ownerFullName", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerEmail">Email *</Label>
                    <Input id="ownerEmail" type="email" value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerPhone">Phone</Label>
                    <Input id="ownerPhone" value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerCountryCode">Country</Label>
                    <Select value={form.ownerCountryCode} onValueChange={(v) => set("ownerCountryCode", v)}>
                      <SelectTrigger id="ownerCountryCode">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {ISO_COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            <span className="mr-2">{c.flag}</span>{c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/40">
                  <div className="text-sm">
                    <div>
                      Total ownership: <span className={Math.abs(totals.ownership - 100) < 0.01 ? "text-indigo-600 font-semibold" : "text-destructive font-semibold"}>{totals.ownership.toFixed(2)}%</span>
                    </div>
                    <div>
                      Total voting: <span className={Math.abs(totals.voting - 100) < 0.01 ? "text-indigo-600 font-semibold" : "text-destructive font-semibold"}>{totals.voting.toFixed(2)}%</span>
                    </div>
                  </div>
                  {!ubosValid && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="w-3 h-3" /> Must total 100%
                    </Badge>
                  )}
                </div>

                <div className="space-y-3">
                  {form.ubos.map((u, i) => (
                    <Card key={u.id}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">UBO #{i + 1}</p>
                          {form.ubos.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => setForm((f) => ({ ...f, ubos: f.ubos.filter((x) => x.id !== u.id) }))}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Full name *</Label>
                            <Input value={u.full_name} onChange={(e) => updateUbo(u.id, { full_name: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Nationality</Label>
                            <Select value={u.nationality} onValueChange={(v) => updateUbo(u.id, { nationality: v })}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                {ISO_COUNTRIES.map((c) => (
                                  <SelectItem key={c.code} value={c.code}>
                                    <span className="mr-2">{c.flag}</span>{c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Ownership % *</Label>
                            <Input type="number" min="0" max="100" step="0.01" value={u.ownership_pct} onChange={(e) => updateUbo(u.id, { ownership_pct: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Voting %</Label>
                            <Input type="number" min="0" max="100" step="0.01" value={u.voting_pct} onChange={(e) => updateUbo(u.id, { voting_pct: e.target.value })} placeholder="Same as ownership" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Control %</Label>
                            <Input type="number" min="0" max="100" step="0.01" value={u.control_pct} onChange={(e) => updateUbo(u.id, { control_pct: e.target.value })} />
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">DOB</Label>
                            <Input type="date" value={u.dob} onChange={(e) => updateUbo(u.id, { dob: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">PEP status</Label>
                            <Select value={u.pep_status} onValueChange={(v) => updateUbo(u.id, { pep_status: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="domestic_pep">Domestic PEP</SelectItem>
                                <SelectItem value="foreign_pep">Foreign PEP</SelectItem>
                                <SelectItem value="hio">Head of Intl Org</SelectItem>
                                <SelectItem value="family_member">Family member</SelectItem>
                                <SelectItem value="close_associate">Close associate</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Button variant="outline" onClick={() => setForm((f) => ({ ...f, ubos: [...f.ubos, newUbo()] }))} className="w-full">
                  <Plus className="w-4 h-4 mr-1" /> Add another UBO
                </Button>
              </>
            )}

            {step === 3 && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 py-2 border-b">
                  <span className="text-muted-foreground">Business</span>
                  <span className="font-medium">{form.businessName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 py-2 border-b">
                  <span className="text-muted-foreground">Owner</span>
                  <span className="font-medium">{form.ownerFullName} ({form.ownerEmail})</span>
                </div>
                <div className="grid grid-cols-2 gap-2 py-2 border-b">
                  <span className="text-muted-foreground">UBOs</span>
                  <span className="font-medium">{form.ubos.length} owner(s) totalling {totals.ownership.toFixed(2)}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 py-2 border-b">
                  <span className="text-muted-foreground">KYC tier</span>
                  <span className="font-mono">tier_0 (owner completes)</span>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="sendInvite"
                    checked={form.sendInviteEmail}
                    onCheckedChange={(c) => set("sendInviteEmail", !!c)}
                  />
                  <Label htmlFor="sendInvite" className="text-sm font-normal">
                    Send invite email to {form.ownerEmail}
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
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || !form.sendInviteEmail}>
              {submit.isPending && <LoadingSpinner size={16} className="mr-2" />}
              Create business & send invite
            </Button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default OnboardBusinessPage;
