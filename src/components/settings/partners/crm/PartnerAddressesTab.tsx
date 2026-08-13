import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { CountryCombobox, countryLabel } from "../CountryCombobox";
import {
  ADDRESS_TYPES,
  prettyLabel,
  useDeletePartnerAddress,
  usePartnerAddresses,
  useSavePartnerAddress,
  type PartnerAddress,
} from "@/hooks/usePartnerCrm";

const emptyDraft = (partnerId: string, type = "registered"): Partial<PartnerAddress> => ({
  partner_id: partnerId,
  address_type: type,
  is_primary: false,
});

const oneLine = (a: PartnerAddress) =>
  [a.line1, a.line2, a.city, a.region, a.postal_code, countryLabel(a.country)]
    .filter(Boolean)
    .join(", ") || "—";

/** Registered, operations, billing and mailing addresses for a partner. */
export const PartnerAddressesTab = ({ partnerId }: { partnerId: string }) => {
  const { data: addresses, isLoading } = usePartnerAddresses(partnerId);
  const save = useSavePartnerAddress();
  const remove = useDeletePartnerAddress();
  const [draft, setDraft] = useState<Partial<PartnerAddress> | null>(null);

  const set = (patch: Partial<PartnerAddress>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));

  const registered = addresses?.find((a) => a.address_type === "registered");

  const copyRegistered = () => {
    if (!registered) return;
    set({
      line1: registered.line1,
      line2: registered.line2,
      city: registered.city,
      region: registered.region,
      postal_code: registered.postal_code,
      country: registered.country,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Legal, operating, billing and mailing addresses on file for this partner.
        </p>
        <Button size="sm" onClick={() => setDraft(emptyDraft(partnerId))}>
          <Plus className="mr-1 h-4 w-4" /> Add address
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !addresses?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No addresses recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {addresses.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{prettyLabel(a.address_type)}</span>
                  {a.is_primary ? <Badge className="text-[10px]">primary</Badge> : null}
                </div>
                <p className="mt-1 break-words text-sm">{oneLine(a)}</p>
                {a.notes ? <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p> : null}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setDraft(a)} aria-label="Edit address">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)} aria-label="Delete address">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit address" : "Add address"}</DialogTitle>
            <DialogDescription>Same field set for every address type, so copying is easy.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Address type</Label>
                <Select value={draft.address_type ?? "registered"} onValueChange={(v) => set({ address_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADDRESS_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {prettyLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                {registered && draft.address_type !== "registered" ? (
                  <Button type="button" variant="outline" size="sm" onClick={copyRegistered}>
                    <Copy className="mr-1 h-4 w-4" /> Same as registered
                  </Button>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <Label>Address line 1</Label>
                <Input value={draft.line1 ?? ""} onChange={(e) => set({ line1: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Address line 2</Label>
                <Input value={draft.line2 ?? ""} onChange={(e) => set({ line2: e.target.value })} />
              </div>
              <div>
                <Label>City / town</Label>
                <Input value={draft.city ?? ""} onChange={(e) => set({ city: e.target.value })} />
              </div>
              <div>
                <Label>State / province</Label>
                <Input value={draft.region ?? ""} onChange={(e) => set({ region: e.target.value })} />
              </div>
              <div>
                <Label>Postal / ZIP code</Label>
                <Input value={draft.postal_code ?? ""} onChange={(e) => set({ postal_code: e.target.value })} />
              </div>
              <div>
                <Label>Country</Label>
                <CountryCombobox value={draft.country} onChange={(code) => set({ country: code })} />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={!!draft.is_primary}
                    onCheckedChange={(v) => set({ is_primary: v })}
                    aria-label="Primary address"
                  />
                  Primary address
                </label>
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Input value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={() => draft && save.mutate(draft, { onSuccess: () => setDraft(null) })} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerAddressesTab;
