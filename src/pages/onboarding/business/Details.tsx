import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Check, ChevronsUpDown, FileText } from "lucide-react";
import KybShell from "@/components/kyb/KybShell";
import KybStatusGate from "@/components/kyb/KybStatusGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useKyb, BusinessEntityType } from "@/hooks/useKyb";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import LoadingSpinner from "@/components/LoadingSpinner";

const ENTITY_TYPES: { value: BusinessEntityType; label: string }[] = [
  { value: "sole_proprietorship", label: "Sole proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "corporation", label: "Corporation" },
  { value: "llc", label: "Limited liability company" },
  { value: "cooperative", label: "Cooperative" },
  { value: "ngo", label: "Non-profit / NGO" },
  { value: "trust", label: "Trust" },
  { value: "other", label: "Other" },
];

// Business onboarding is only live where a document matrix is seeded (kyb_document_requirements).
// All countries are shown for search, but only these can be submitted.
const SUPPORTED_COUNTRY_CODES = new Set(["CA", "NG"]);

const splitFullName = (full: string | null | undefined) => {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
};

const Details = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { business, saveBusiness, isLoading } = useKyb();

  const [countryOpen, setCountryOpen] = useState(false);

  const [contactFirst, setContactFirst] = useState("");
  const [contactLast, setContactLast] = useState("");

  const [form, setForm] = useState({
    legal_name: "",
    operating_name: "",
    entity_type: "" as BusinessEntityType | "",
    registration_number: "",
    tax_id: "",
    date_of_incorporation: "",
    incorporation_country: "",
    incorporation_region: "",
    industry: "",
    website: "",
    business_phone: "",
    business_email: "",
    expected_monthly_volume: "",
    source_of_funds: "",
    street_address: "",
    city: "",
    state_province: "",
    postal_code: "",
  });

  useEffect(() => {
    if (!business) return;
    setForm((f) => ({
      ...f,
      legal_name: business.legal_name ?? "",
      operating_name: business.operating_name ?? "",
      entity_type: business.entity_type ?? "",
      registration_number: business.registration_number ?? "",
      tax_id: business.tax_id ?? "",
      date_of_incorporation: business.date_of_incorporation ?? "",
      incorporation_country: business.incorporation_country ?? "",
      incorporation_region: business.incorporation_region ?? "",
      industry: business.industry ?? "",
      website: business.website ?? "",
      business_phone: business.business_phone ?? "",
      business_email: business.business_email ?? "",
      expected_monthly_volume:
        business.expected_monthly_volume === null ? "" : String(business.expected_monthly_volume),
      source_of_funds: business.source_of_funds ?? "",
      street_address: business.street_address ?? "",
      city: business.city ?? "",
      state_province: business.state_province ?? "",
      postal_code: business.postal_code ?? "",
    }));
  }, [business]);

  useEffect(() => {
    if (business || !profile) return;
    setForm((f) => ({
      ...f,
      street_address: f.street_address || profile.street_address || "",
      city: f.city || profile.city || "",
      state_province: f.state_province || profile.state_province || "",
      postal_code: f.postal_code || profile.postal_code || "",
      incorporation_country:
        f.incorporation_country || profile.address_country || profile.country_code || "",
      business_phone: f.business_phone || profile.phone_number || "",
      business_email: f.business_email || profile.email || "",
    }));
  }, [business, profile]);

  useEffect(() => {
    const meta = user?.user_metadata as
      | { first_name?: string; last_name?: string; full_name?: string }
      | undefined;
    const fromMeta = splitFullName(
      [meta?.first_name, meta?.last_name].filter(Boolean).join(" ") || meta?.full_name || "",
    );
    const fromProfile = splitFullName(profile?.full_name);
    setContactFirst((f) => f || fromProfile.first || fromMeta.first);
    setContactLast((l) => l || fromProfile.last || fromMeta.last);
  }, [profile?.full_name, user?.user_metadata]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectedCountry = findIsoCountry(form.incorporation_country);
  const countryUnsupported = useMemo(
    () => !!form.incorporation_country && !SUPPORTED_COUNTRY_CODES.has(form.incorporation_country),
    [form.incorporation_country],
  );

  const submit = async () => {
    if (!form.legal_name.trim()) return toast.error("Legal business name is required.");
    if (!form.entity_type) return toast.error("Select the entity type.");
    if (!form.incorporation_country) return toast.error("Select the country of registration.");
    if (!form.registration_number.trim())
      return toast.error("Business registration number is required.");
    if (!contactFirst.trim() || !contactLast.trim())
      return toast.error("Contact person first and last name are required.");

    try {
      const contactName = `${contactFirst.trim()} ${contactLast.trim()}`.trim();
      if (user?.id) {
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ full_name: contactName })
          .eq("user_id", user.id);
        if (profileErr) console.warn("contact person profile update:", profileErr.message);
      }
      await saveBusiness.mutateAsync({
        legal_name: form.legal_name.trim(),
        operating_name: form.operating_name.trim() || null,
        entity_type: form.entity_type as BusinessEntityType,
        registration_number: form.registration_number.trim(),
        tax_id: form.tax_id.trim() || null,
        date_of_incorporation: form.date_of_incorporation || null,
        incorporation_country: form.incorporation_country,
        incorporation_region: form.incorporation_region.trim() || null,
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
        business_phone: form.business_phone.trim() || null,
        business_email: form.business_email.trim() || null,
        expected_monthly_volume: form.expected_monthly_volume
          ? Number(form.expected_monthly_volume)
          : null,
        source_of_funds: form.source_of_funds.trim() || null,
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        state_province: form.state_province.trim() || null,
        postal_code: form.postal_code.trim() || null,
        address_country: form.incorporation_country,
        current_step: "ownership",
        kyb_status: business?.kyb_status === "rejected" ? "in_progress" : business?.kyb_status || "in_progress",
      });
      navigate("/onboarding/business/ownership");
    } catch (e: any) {
      toast.error(e?.message || "Could not save business details.");
    }
  };

  if (isLoading) {
    return (
      <KybShell step={1} title="Tell us about your business">
        <div className="flex justify-center py-16">
          <LoadingSpinner size={64} />
        </div>
      </KybShell>
    );
  }

  return (
    <KybShell
      step={1}
      title="Tell us about your business"
      subtitle="This must match your registration documents exactly. Companies are verified by our compliance team — not Persona or Interac."
    >
      <KybStatusGate page="details" />
      <Card className="p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Manual KYB review</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Persona and Interac are for personal identity only. For a company you'll provide details, ownership, and
            documents. A compliance officer reviews everything, typically within 1–2 business days.
          </p>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Contact person</h3>
        <p className="text-sm text-muted-foreground">
          The person we'll reach for this company account — typically a director or signing officer.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contact_first">First name *</Label>
            <Input
              id="contact_first"
              value={contactFirst}
              onChange={(e) => setContactFirst(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_last">Last name *</Label>
            <Input
              id="contact_last"
              value={contactLast}
              onChange={(e) => setContactLast(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="legal_name">Legal business name *</Label>
          <Input
            id="legal_name"
            value={form.legal_name}
            onChange={(e) => set("legal_name")(e.target.value)}
            placeholder="As shown on your certificate of incorporation"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="operating_name">Operating / trade name</Label>
          <Input
            id="operating_name"
            value={form.operating_name}
            onChange={(e) => set("operating_name")(e.target.value)}
            placeholder="If different from the legal name"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Entity type *</Label>
            <Select value={form.entity_type} onValueChange={set("entity_type")}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Country of registration *</Label>
            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={countryOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedCountry ? (
                    <span className="inline-flex items-center gap-2 truncate">
                      <span className="text-lg leading-none">{selectedCountry.flag}</span>
                      <span className="truncate">{selectedCountry.name}</span>
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
                            set("incorporation_country")(c.code);
                            setCountryOpen(false);
                          }}
                        >
                          <span className="text-lg leading-none mr-2">{c.flag}</span>
                          <span className="flex-1 truncate">{c.name}</span>
                          <Check
                            className={cn(
                              "w-4 h-4 ml-2",
                              form.incorporation_country === c.code ? "opacity-100" : "opacity-0",
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {countryUnsupported && (
              <p className="text-xs text-muted-foreground">
                We'll use a standard document pack for this country. A compliance officer reviews everything.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="registration_number">Registration number *</Label>
            <Input
              id="registration_number"
              value={form.registration_number}
              onChange={(e) => set("registration_number")(e.target.value)}
              placeholder={form.incorporation_country === "NG" ? "RC number" : "Business number"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="incorporation_region">Province / State of registration</Label>
            <Input
              id="incorporation_region"
              value={form.incorporation_region}
              onChange={(e) => set("incorporation_region")(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tax_id">Tax ID</Label>
            <Input
              id="tax_id"
              value={form.tax_id}
              onChange={(e) => set("tax_id")(e.target.value)}
              placeholder={form.incorporation_country === "NG" ? "TIN" : "GST/HST number"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_of_incorporation">Date of incorporation</Label>
            <Input
              id="date_of_incorporation"
              type="date"
              value={form.date_of_incorporation}
              onChange={(e) => set("date_of_incorporation")(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Registered address</h3>
        <div className="space-y-2">
          <Label htmlFor="street_address">Street address</Label>
          <Input
            id="street_address"
            value={form.street_address}
            onChange={(e) => set("street_address")(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={form.city} onChange={(e) => set("city")(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state_province">Province / State</Label>
            <Input
              id="state_province"
              value={form.state_province}
              onChange={(e) => set("state_province")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postal_code">Postal code</Label>
            <Input
              id="postal_code"
              value={form.postal_code}
              onChange={(e) => set("postal_code")(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Business activity</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={form.industry}
              onChange={(e) => set("industry")(e.target.value)}
              placeholder="e.g. Import & export"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expected_monthly_volume">Expected monthly volume (CAD)</Label>
            <Input
              id="expected_monthly_volume"
              type="number"
              min="0"
              value={form.expected_monthly_volume}
              onChange={(e) => set("expected_monthly_volume")(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="business_email">Business email</Label>
            <Input
              id="business_email"
              type="email"
              value={form.business_email}
              onChange={(e) => set("business_email")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_phone">Business phone</Label>
            <Input
              id="business_phone"
              value={form.business_phone}
              onChange={(e) => set("business_phone")(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={form.website}
            onChange={(e) => set("website")(e.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="source_of_funds">Source of funds</Label>
          <Textarea
            id="source_of_funds"
            value={form.source_of_funds}
            onChange={(e) => set("source_of_funds")(e.target.value)}
            placeholder="Where does the money moving through this account come from?"
            rows={3}
          />
        </div>
      </Card>

      <Button
        onClick={submit}
        disabled={saveBusiness.isPending || isLoading || countryUnsupported}
        size="lg"
        className="w-full"
      >
        {saveBusiness.isPending ? "Saving..." : "Continue to ownership"}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </KybShell>
  );
};

export default Details;
