import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Plus, Trash2, AlertTriangle } from "lucide-react";
import KybShell from "@/components/kyb/KybShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useKyb,
  BusinessOwnerRole,
  UBO_THRESHOLD_PERCENT,
} from "@/hooks/useKyb";

const ROLES: { value: BusinessOwnerRole; label: string }[] = [
  { value: "beneficial_owner", label: "Beneficial owner" },
  { value: "director", label: "Director" },
  { value: "signing_officer", label: "Signing officer" },
  { value: "senior_officer", label: "Senior officer" },
];

const EMPTY = {
  full_name: "",
  role: "beneficial_owner" as BusinessOwnerRole,
  ownership_percent: "",
  date_of_birth: "",
  nationality: "",
  occupation: "",
  email: "",
  phone: "",
  street_address: "",
  city: "",
  state_province: "",
  postal_code: "",
  is_pep: false,
};

const Ownership = () => {
  const navigate = useNavigate();
  const {
    business,
    owners,
    ownershipTotal,
    ownershipValid,
    hasDeclaredOwners,
    saveOwner,
    removeOwner,
    saveBusiness,
  } = useKyb();

  const [draft, setDraft] = useState(EMPTY);
  const [adding, setAdding] = useState(false);

  const set = (key: keyof typeof draft) => (value: string | boolean) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const add = async () => {
    if (!draft.full_name.trim()) return toast.error("Full legal name is required.");
    const pct = Number(draft.ownership_percent || 0);
    if (draft.role === "beneficial_owner" && pct <= 0)
      return toast.error("A beneficial owner needs an ownership percentage.");
    if (pct < 0 || pct > 100) return toast.error("Ownership must be between 0 and 100.");
    if (draft.role === "beneficial_owner" && ownershipTotal + pct > 100)
      return toast.error(
        `Total ownership would be ${(ownershipTotal + pct).toFixed(2)}%. It cannot exceed 100%.`
      );

    try {
      await saveOwner.mutateAsync({
        full_name: draft.full_name.trim(),
        role: draft.role,
        ownership_percent: pct,
        date_of_birth: draft.date_of_birth || null,
        nationality: draft.nationality.trim().toUpperCase() || null,
        occupation: draft.occupation.trim() || null,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        street_address: draft.street_address.trim() || null,
        city: draft.city.trim() || null,
        state_province: draft.state_province.trim() || null,
        postal_code: draft.postal_code.trim() || null,
        is_pep: draft.is_pep,
      });
      setDraft(EMPTY);
      setAdding(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not add this person.");
    }
  };

  const cont = async () => {
    if (!hasDeclaredOwners)
      return toast.error(
        `Declare every individual owning ${UBO_THRESHOLD_PERCENT}% or more of the business.`
      );
    if (!ownershipValid) return toast.error("Total ownership cannot exceed 100%.");
    await saveBusiness.mutateAsync({ current_step: "documents" });
    navigate("/onboarding/business/documents");
  };

  if (!business) {
    navigate("/onboarding/business/details", { replace: true });
    return null;
  }

  return (
    <KybShell
      step={2}
      title="Who owns and controls the business?"
      subtitle={`List every individual who owns ${UBO_THRESHOLD_PERCENT}% or more, plus all directors and signing officers. This is a regulatory requirement.`}
    >
      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Total declared ownership</p>
          <p className="text-xs text-muted-foreground">
            {owners.filter((o) => o.role === "beneficial_owner").length} beneficial owner(s)
          </p>
        </div>
        <Badge variant={ownershipValid ? "secondary" : "destructive"} className="text-sm">
          {ownershipTotal.toFixed(2)}%
        </Badge>
      </Card>

      {!ownershipValid && (
        <Card className="p-4 flex items-start gap-3 border-destructive/50">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-sm text-foreground">
            Declared ownership exceeds 100%. Remove or correct an entry before continuing.
          </p>
        </Card>
      )}

      {owners.map((o) => (
        <Card key={o.id} className="p-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{o.full_name}</p>
            <p className="text-xs text-muted-foreground">
              {ROLES.find((r) => r.value === o.role)?.label}
              {o.role === "beneficial_owner" && ` · ${Number(o.ownership_percent).toFixed(2)}%`}
              {o.is_pep && " · PEP"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeOwner.mutate(o.id)}
            aria-label={`Remove ${o.full_name}`}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </Card>
      ))}

      {adding ? (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Add a person</h3>

          <div className="space-y-2">
            <Label htmlFor="full_name">Full legal name *</Label>
            <Input
              id="full_name"
              value={draft.full_name}
              onChange={(e) => set("full_name")(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={draft.role} onValueChange={(v) => set("role")(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownership_percent">Ownership %</Label>
              <Input
                id="ownership_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={draft.ownership_percent}
                onChange={(e) => set("ownership_percent")(e.target.value)}
                disabled={draft.role !== "beneficial_owner"}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={draft.date_of_birth}
                onChange={(e) => set("date_of_birth")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nationality">Nationality (2-letter code)</Label>
              <Input
                id="nationality"
                maxLength={2}
                value={draft.nationality}
                onChange={(e) => set("nationality")(e.target.value)}
                placeholder="CA"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="occupation">Occupation</Label>
              <Input
                id="occupation"
                value={draft.occupation}
                onChange={(e) => set("occupation")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner_email">Email</Label>
              <Input
                id="owner_email"
                type="email"
                value={draft.email}
                onChange={(e) => set("email")(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner_street">Residential address</Label>
            <Input
              id="owner_street"
              value={draft.street_address}
              onChange={(e) => set("street_address")(e.target.value)}
              placeholder="Street address"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              value={draft.city}
              onChange={(e) => set("city")(e.target.value)}
              placeholder="City"
              aria-label="City"
            />
            <Input
              value={draft.state_province}
              onChange={(e) => set("state_province")(e.target.value)}
              placeholder="Province / State"
              aria-label="Province or state"
            />
            <Input
              value={draft.postal_code}
              onChange={(e) => set("postal_code")(e.target.value)}
              placeholder="Postal code"
              aria-label="Postal code"
            />
          </div>

          <div className="flex items-start gap-3 pt-2">
            <Checkbox
              id="is_pep"
              checked={draft.is_pep}
              onCheckedChange={(v) => set("is_pep")(v === true)}
            />
            <Label htmlFor="is_pep" className="text-sm font-normal leading-snug">
              This person is a politically exposed person (PEP), a close associate of one, or the
              head of an international organization.
            </Label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={add} disabled={saveOwner.isPending} className="flex-1">
              {saveOwner.isPending ? "Adding..." : "Add person"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(EMPTY);
                setAdding(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Add owner, director or signing officer
        </Button>
      )}

      <Button
        onClick={cont}
        disabled={!hasDeclaredOwners || !ownershipValid || saveBusiness.isPending}
        size="lg"
        className="w-full"
      >
        Continue to documents
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </KybShell>
  );
};

export default Ownership;
