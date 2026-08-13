import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mail, Phone, Pencil, Plus, Trash2, User } from "lucide-react";
import {
  CONTACT_ROLES,
  prettyLabel,
  useDeletePartnerContact,
  usePartnerContacts,
  useSavePartnerContact,
  type PartnerContact,
} from "@/hooks/usePartnerCrm";

const CHANNELS = ["email", "phone", "whatsapp", "slack", "portal"];

const emptyDraft = (partnerId: string): Partial<PartnerContact> => ({
  partner_id: partnerId,
  full_name: "",
  role_type: "commercial",
  preferred_channel: "email",
  is_primary: false,
  is_active: true,
});

/** People we deal with at a partner: commercial, integration, support, compliance, finance. */
export const PartnerContactsTab = ({ partnerId }: { partnerId: string }) => {
  const { data: contacts, isLoading } = usePartnerContacts(partnerId);
  const save = useSavePartnerContact();
  const remove = useDeletePartnerContact();
  const [draft, setDraft] = useState<Partial<PartnerContact> | null>(null);

  const set = (patch: Partial<PartnerContact>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));

  const submit = () => {
    if (!draft?.full_name?.trim()) return;
    save.mutate(draft, { onSuccess: () => setDraft(null) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Who to contact at this partner, and in what order to escalate.
        </p>
        <Button size="sm" onClick={() => setDraft(emptyDraft(partnerId))}>
          <Plus className="mr-1 h-4 w-4" /> Add contact
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !contacts?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No contacts recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{c.full_name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {prettyLabel(c.role_type)}
                    </Badge>
                    {c.is_primary ? <Badge className="text-[10px]">primary</Badge> : null}
                    {c.escalation_order ? (
                      <Badge variant="secondary" className="text-[10px]">
                        escalation #{c.escalation_order}
                      </Badge>
                    ) : null}
                    {!c.is_active ? (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        inactive
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[c.title, c.timezone].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {c.email ? (
                      <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`mailto:${c.email}`}>
                        <Mail className="h-3.5 w-3.5" /> {c.email}
                      </a>
                    ) : null}
                    {c.phone ? (
                      <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${c.phone}`}>
                        <Phone className="h-3.5 w-3.5" /> {c.phone}
                      </a>
                    ) : null}
                    {c.phone_alt ? <span className="text-muted-foreground">alt {c.phone_alt}</span> : null}
                  </div>
                  {c.notes ? <p className="mt-2 text-xs text-muted-foreground">{c.notes}</p> : null}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setDraft(c)} aria-label="Edit contact">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove.mutate(c.id)}
                    aria-label="Delete contact"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription>Commercial, technical, compliance or finance contact.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Full name</Label>
                <Input value={draft.full_name ?? ""} onChange={(e) => set({ full_name: e.target.value })} />
              </div>
              <div>
                <Label>Job title</Label>
                <Input value={draft.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={draft.role_type ?? "commercial"} onValueChange={(v) => set({ role_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {prettyLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={draft.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <div>
                <Label>Alternate phone</Label>
                <Input value={draft.phone_alt ?? ""} onChange={(e) => set({ phone_alt: e.target.value })} />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input
                  placeholder="Africa/Lagos"
                  value={draft.timezone ?? ""}
                  onChange={(e) => set({ timezone: e.target.value })}
                />
              </div>
              <div>
                <Label>Preferred channel</Label>
                <Select value={draft.preferred_channel ?? "email"} onValueChange={(v) => set({ preferred_channel: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {prettyLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Escalation order</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.escalation_order ?? ""}
                  onChange={(e) =>
                    set({ escalation_order: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </div>
              <div className="flex items-center gap-6 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={!!draft.is_primary}
                    onCheckedChange={(v) => set({ is_primary: v })}
                    aria-label="Primary contact"
                  />
                  Primary contact
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.is_active !== false}
                    onCheckedChange={(v) => set({ is_active: v })}
                    aria-label="Active"
                  />
                  Active
                </label>
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!draft?.full_name?.trim() || save.isPending}>
              {save.isPending ? "Saving…" : "Save contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerContactsTab;
