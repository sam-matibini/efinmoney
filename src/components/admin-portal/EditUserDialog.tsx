import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ISO_COUNTRIES, findIsoCountry } from "@/lib/isoCountries";
import { WORLD_CURRENCIES } from "@/lib/worldCurrencies";

export interface EditableUserProfile {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  date_of_birth?: string | null;
  occupation?: string | null;
  street_address?: string | null;
  city?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  address_country?: string | null;
  country_code?: string | null;
  default_currency?: string | null;
  efin_tag?: string | null;
}

type FormState = {
  full_name: string;
  email: string;
  phone_number: string;
  date_of_birth: string;
  occupation: string;
  street_address: string;
  city: string;
  state_province: string;
  postal_code: string;
  address_country: string;
  default_currency: string;
  efin_tag: string;
};

const toForm = (p: EditableUserProfile): FormState => ({
  full_name: p.full_name || "",
  email: p.email || "",
  phone_number: p.phone_number || "",
  date_of_birth: p.date_of_birth || "",
  occupation: p.occupation || "",
  street_address: p.street_address || "",
  city: p.city || "",
  state_province: p.state_province || "",
  postal_code: p.postal_code || "",
  address_country: (p.address_country || p.country_code || "").toUpperCase(),
  default_currency: (p.default_currency || "").toUpperCase(),
  efin_tag: (p.efin_tag || "").replace(/^@/, ""),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: EditableUserProfile;
  /** Query keys to refresh after a successful save. */
  invalidateKeys?: unknown[][];
}

export default function EditUserDialog({ open, onOpenChange, profile, invalidateKeys = [] }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(profile));
  const [saving, setSaving] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  useEffect(() => {
    if (open) setForm(toForm(profile));
  }, [open, profile]);

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const original = toForm(profile);
    const dirty = (Object.keys(form) as (keyof FormState)[]).some((k) => form[k].trim() !== original[k].trim());
    if (!dirty) {
      toast.success("No changes to save");
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      // Cold boots occasionally drop the request before a response arrives
      // (FunctionsFetchError). Retry once before surfacing an error.
      let data: unknown = null;
      let error: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await supabase.functions.invoke("admin-update-user", {
          body: { user_id: profile.user_id, updates: form },
        });
        data = res.data;
        error = res.error;
        const isTransport = !!error && !(error as { context?: unknown }).context;
        if (!isTransport) break;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }

      const payload = data as { success?: boolean; error?: string; changed?: Record<string, unknown> } | null;
      if (error) {
        // Edge function errors carry the JSON body in the response
        let message = (error as Error).message;
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        if (ctx?.json) {
          const body = await ctx.json().catch(() => null);
          if (body?.error) message = body.error;
        } else {
          // No response body at all. Surface the raw error in the toast AND
          // log the full object to the console so the dev can see exactly
          // what the network/edge function returned.
          console.error("admin-update-user invoke failed:", error);
          message = `Couldn't reach the server (${(error as Error).message || "no response"}). See DevTools console for details.`;
        }
        throw new Error(message);
      }
      if (payload?.error) throw new Error(payload.error);

      const changedCount = Object.keys(payload?.changed || {}).length;
      toast.success(changedCount ? `Updated ${changedCount} field${changedCount > 1 ? "s" : ""}` : "No changes to save");
      for (const key of invalidateKeys) queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ["admin-user-audit", profile.user_id] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update user");
    } finally {
      setSaving(false);
    }
  };

  const selectedCountry = findIsoCountry(form.address_country);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit user details</DialogTitle>
          <DialogDescription>
            Corrections are applied immediately and recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="eu-name">Full name</Label>
                <Input id="eu-name" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-email">Email</Label>
                <Input id="eu-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} maxLength={255} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-phone">Phone</Label>
                <Input id="eu-phone" value={form.phone_number} onChange={(e) => set("phone_number")(e.target.value)} placeholder="+14165550123" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-dob">Date of birth</Label>
                <Input id="eu-dob" type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-occupation">Occupation</Label>
                <Input id="eu-occupation" value={form.occupation} onChange={(e) => set("occupation")(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-tag">eFin tag</Label>
                <Input
                  id="eu-tag"
                  value={form.efin_tag}
                  onChange={(e) => set("efin_tag")(e.target.value.replace(/^@/, ""))}
                  placeholder="username"
                  maxLength={20}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address</h3>
            <div className="space-y-2">
              <Label htmlFor="eu-street">Street address</Label>
              <Input id="eu-street" value={form.street_address} onChange={(e) => set("street_address")(e.target.value)} maxLength={200} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="eu-city">City</Label>
                <Input id="eu-city" value={form.city} onChange={(e) => set("city")(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-state">State / Province</Label>
                <Input id="eu-state" value={form.state_province} onChange={(e) => set("state_province")(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-postal">Postal code</Label>
                <Input id="eu-postal" value={form.postal_code} onChange={(e) => set("postal_code")(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
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
                  <PopoverContent align="start" className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]">
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
                                set("address_country")(c.code);
                                setCountryOpen(false);
                              }}
                            >
                              <span className="text-lg leading-none mr-2">{c.flag}</span>
                              <span className="flex-1 truncate">{c.name}</span>
                              <Check className={cn("w-4 h-4 ml-2", form.address_country === c.code ? "opacity-100" : "opacity-0")} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preferences</h3>
            <div className="space-y-2 sm:max-w-xs">
              <Label>Default currency</Label>
              <Popover open={currencyOpen} onOpenChange={setCurrencyOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {form.default_currency || <span className="text-muted-foreground">Select currency</span>}
                    <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]">
                  <Command>
                    <CommandInput placeholder="Search currency..." />
                    <CommandList>
                      <CommandEmpty>No currency found.</CommandEmpty>
                      <CommandGroup>
                        {WORLD_CURRENCIES.map((c) => (
                          <CommandItem
                            key={c.code}
                            value={`${c.code} ${c.name}`}
                            onSelect={() => {
                              set("default_currency")(c.code);
                              setCurrencyOpen(false);
                            }}
                          >
                            <span className="font-medium w-12">{c.code}</span>
                            <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                            <Check className={cn("w-4 h-4 ml-2", form.default_currency === c.code ? "opacity-100" : "opacity-0")} />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
