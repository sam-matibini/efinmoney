import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Table, TableBody, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Mail, Phone, Plus, Users } from "lucide-react";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import { useTableQuery, type Col } from "../tableToolkit";
import { countryLabel } from "../CountryCombobox";
import {
  CONTACT_ROLES,
  DOC_STATUSES,
  DOC_TYPES,
  docExpiryState,
  prettyLabel,
  usePartnerAddresses,
  usePartnerContacts,
  usePartnerDocuments,
  useSavePartnerContact,
  useUploadPartnerDocument,
  type PartnerContact,
} from "@/hooks/usePartnerCrm";

interface ContactRow {
  id: string;
  partner: string;
  partner_ref: string;
  role: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  escalation: number | null;
  primary: boolean;
  active: boolean;
  country: string;
}

const CHANNELS = ["email", "phone", "whatsapp", "slack", "portal"];

/** Cross-partner view of every contact, plus documents needing attention. */
export const PartnerRelationshipsPanel = () => {
  const { data: partners, isLoading: partnersLoading } = usePaymentPartners();
  const { data: contacts, isLoading: contactsLoading } = usePartnerContacts();
  const { data: docs } = usePartnerDocuments();
  const { data: addresses } = usePartnerAddresses();

  // ── Upload contract dialog ──
  const uploadDoc = useUploadPartnerDocument();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadPartnerId, setUploadPartnerId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDraft, setUploadDraft] = useState<Record<string, string>>({});
  const setDoc = (patch: Record<string, string>) => setUploadDraft((d) => ({ ...d, ...patch }));

  const openUpload = (partnerId: string) => {
    setUploadPartnerId(partnerId);
    setUploadFile(null);
    setUploadDraft({ doc_type: "agreement", status: "executed" });
  };
  const submitUpload = () => {
    if (!uploadFile || !uploadPartnerId) return;
    uploadDoc.mutate(
      { partner_id: uploadPartnerId, file: uploadFile, meta: uploadDraft },
      { onSuccess: () => { setUploadPartnerId(null); setUploadFile(null); } },
    );
  };

  // ── Add primary contact dialog ──
  const saveContact = useSavePartnerContact();
  const [contactPartnerId, setContactPartnerId] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<Partial<PartnerContact>>({});
  const setContact = (patch: Partial<PartnerContact>) => setContactDraft((d) => ({ ...d, ...patch }));

  const openContact = (partnerId: string) => {
    setContactPartnerId(partnerId);
    setContactDraft({
      partner_id: partnerId,
      full_name: "",
      role_type: "commercial",
      preferred_channel: "email",
      is_primary: true,
      is_active: true,
    });
  };
  const openNewContact = () => {
    setContactPartnerId("__new__");
    setContactDraft({ role_type: "commercial", preferred_channel: "email", is_primary: true, is_active: true });
  };
  const submitContact = () => {
    if (!contactDraft.full_name?.trim()) return;
    if (contactPartnerId === "__new__" && !contactDraft.partner_id) return;
    saveContact.mutate(contactDraft, { onSuccess: () => setContactPartnerId(null) });
  };

  const partnerById = useMemo(
    () => new Map((partners ?? []).map((p) => [p.id, p])),
    [partners],
  );

  const rows = useMemo<ContactRow[]>(
    () =>
      (contacts ?? []).map((c) => {
        const p = partnerById.get(c.partner_id);
        const addr = (addresses ?? []).find((a) => a.partner_id === c.partner_id && a.is_primary)
          ?? (addresses ?? []).find((a) => a.partner_id === c.partner_id);
        return {
          id: c.id,
          partner: p?.name ?? "—",
          partner_ref: p?.partner_ref ?? "",
          role: prettyLabel(c.role_type),
          name: c.full_name,
          title: c.title ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          escalation: c.escalation_order,
          primary: c.is_primary,
          active: c.is_active,
          country: addr?.country ?? p?.country ?? "",
        };
      }),
    [contacts, partnerById, addresses],
  );

  const cols = useMemo<Col<ContactRow>[]>(
    () => [
      { key: "partner_ref", label: "Ref", value: (r) => r.partner_ref, filter: true },
      { key: "partner", label: "Partner", value: (r) => r.partner, filter: true },
      { key: "name", label: "Contact", value: (r) => r.name },
      { key: "role", label: "Role", value: (r) => r.role, filter: true },
      { key: "title", label: "Title", value: (r) => r.title },
      { key: "email", label: "Email", value: (r) => r.email },
      { key: "phone", label: "Phone", value: (r) => r.phone },
      {
        key: "country",
        label: "Country",
        value: (r) => r.country,
        filter: true,
        filterLabel: countryLabel,
      },
      { key: "escalation", label: "Escalation", value: (r) => r.escalation, type: "number", align: "right" },
      { key: "flags", label: "Flags", value: (r) => (r.primary ? "primary" : r.active ? "" : "inactive"), filter: true },
    ],
    [],
  );

  const { view, Controls, HeadRow } = useTableQuery(rows, cols, {
    defaultSort: "partner",
    defaultDir: "asc",
    exportName: "partner-contacts",
    searchPlaceholder: "Search partner, contact, email, phone…",
  });

  const attention = useMemo(() => {
    const out: { partner: string; partner_id: string; issue: string; detail: string; action?: "upload" | "contact" }[] = [];
    for (const p of partners ?? []) {
      const pDocs = (docs ?? []).filter((d) => d.partner_id === p.id);
      const executed = pDocs.filter((d) => d.status === "executed");
      if (!executed.length) {
        out.push({ partner: p.name, partner_id: p.id, issue: "No executed agreement", detail: "Upload the signed contract", action: "upload" });
      }
      for (const d of executed) {
        const state = docExpiryState(d.expiry_date);
        if (state === "expired") {
          out.push({
            partner: p.name,
            partner_id: p.id,
            issue: "Agreement expired",
            detail: `${d.title} · ${new Date(d.expiry_date!).toLocaleDateString()}`,
            action: "upload",
          });
        } else if (state === "soon") {
          out.push({
            partner: p.name,
            partner_id: p.id,
            issue: "Renewal due soon",
            detail: `${d.title} · ${new Date(d.expiry_date!).toLocaleDateString()}`,
            action: "upload",
          });
        }
      }
      if (!(contacts ?? []).some((c) => c.partner_id === p.id && c.is_primary && c.is_active)) {
        out.push({ partner: p.name, partner_id: p.id, issue: "No primary contact", detail: "Add a commercial owner", action: "contact" });
      }
    }
    return out;
  }, [partners, docs, contacts]);

  const loading = partnersLoading || contactsLoading;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Needs attention ({attention.length})
          </CardTitle>
          <CardDescription>Missing agreements, expiring contracts and partners without an owner.</CardDescription>
        </CardHeader>
        <CardContent>
          {!attention.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Every partner has an executed agreement and a primary contact.
            </p>
          ) : (
            <ul className="space-y-2">
              {attention.map((a, i) => (
                <li key={`${a.partner}-${a.issue}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">{a.partner}</Badge>
                  <span className="font-medium">{a.issue}</span>
                  {a.action ? (
                    <button
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => a.action === "upload" ? openUpload(a.partner_id) : openContact(a.partner_id)}
                    >
                      {a.detail}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{a.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> All partner contacts
            </CardTitle>
            <CardDescription className="mt-1">
              Add, search, filter, sort and export every contact across the partner network.
            </CardDescription>
          </div>
          <Button size="sm" className="shrink-0" onClick={openNewContact}>
            <Plus className="mr-1.5 h-4 w-4" /> Add contact
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !rows.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No partner contacts yet — click &ldquo;Add contact&rdquo; above to add one.
            </p>
          ) : (
            <div>
              <Controls />
              <div className="overflow-x-auto">
                <Table>
                  <HeadRow />
                  <TableBody>
                    {view.map((r) => (
                      <TableRow key={r.id}>

                          <td className="p-2 font-mono text-xs">{r.partner_ref || "—"}</td>
                          <td className="p-2 text-sm">{r.partner}</td>
                          <td className="p-2 text-sm font-medium">{r.name}</td>
                          <td className="p-2 text-sm">{r.role}</td>
                          <td className="p-2 text-xs text-muted-foreground">{r.title || "—"}</td>
                          <td className="p-2 text-xs">
                            {r.email ? (
                              <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`mailto:${r.email}`}>
                                <Mail className="h-3.5 w-3.5" /> {r.email}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2 text-xs">
                            {r.phone ? (
                              <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${r.phone}`}>
                                <Phone className="h-3.5 w-3.5" /> {r.phone}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2 text-xs">{r.country ? countryLabel(r.country) : "—"}</td>
                          <td className="p-2 text-right text-xs tabular-nums">{r.escalation ?? "—"}</td>
                          <td className="p-2">
                            <div className="flex gap-1">
                              {r.primary ? <Badge className="text-[10px]">primary</Badge> : null}
                              {!r.active ? (
                                <Badge variant="outline" className="text-[10px]">
                                  inactive
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                      </TableRow>

                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Upload signed contract dialog ── */}
      <Dialog open={!!uploadPartnerId} onOpenChange={(v) => !v && setUploadPartnerId(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload signed contract</DialogTitle>
            <DialogDescription>
              {partners?.find((p) => p.id === uploadPartnerId)?.name} · Stored privately; only admins can open it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>File</Label>
              <Input
                ref={fileRef}
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploadFile(f);
                  if (f && !uploadDraft.title) setDoc({ title: f.name.replace(/\.[^.]+$/, "") });
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Title</Label>
                <Input value={uploadDraft.title ?? ""} onChange={(e) => setDoc({ title: e.target.value })} />
              </div>
              <div>
                <Label>Document type</Label>
                <Select value={uploadDraft.doc_type ?? "agreement"} onValueChange={(v) => setDoc({ doc_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{prettyLabel(t)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={uploadDraft.status ?? "executed"} onValueChange={(v) => setDoc({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_STATUSES.map((s) => <SelectItem key={s} value={s}>{prettyLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Version</Label>
                <Input placeholder="v1.0" value={uploadDraft.version ?? ""} onChange={(e) => setDoc({ version: e.target.value })} />
              </div>
              <div>
                <Label>Counterparty signer</Label>
                <Input value={uploadDraft.counterparty_signer ?? ""} onChange={(e) => setDoc({ counterparty_signer: e.target.value })} />
              </div>
              <div>
                <Label>Signed date</Label>
                <Input type="date" value={uploadDraft.signed_date ?? ""} onChange={(e) => setDoc({ signed_date: e.target.value })} />
              </div>
              <div>
                <Label>Effective date</Label>
                <Input type="date" value={uploadDraft.effective_date ?? ""} onChange={(e) => setDoc({ effective_date: e.target.value })} />
              </div>
              <div>
                <Label>Expiry / renewal date</Label>
                <Input type="date" value={uploadDraft.expiry_date ?? ""} onChange={(e) => setDoc({ expiry_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={uploadDraft.notes ?? ""} onChange={(e) => setDoc({ notes: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadPartnerId(null)}>Cancel</Button>
            <Button onClick={submitUpload} disabled={!uploadFile || uploadDoc.isPending}>
              {uploadDoc.isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add contact dialog ── */}
      <Dialog open={!!contactPartnerId} onOpenChange={(v) => !v && setContactPartnerId(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{contactPartnerId === "__new__" ? "Add contact" : "Add primary contact"}</DialogTitle>
            <DialogDescription>
              {contactPartnerId === "__new__"
                ? "Add a contact for any partner in the network."
                : `${partners?.find((p) => p.id === contactPartnerId)?.name} · Commercial owner / primary contact.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {contactPartnerId === "__new__" && (
              <div className="sm:col-span-2">
                <Label>Partner</Label>
                <Select
                  value={contactDraft.partner_id ?? ""}
                  onValueChange={(v) => setContact({ partner_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select partner…" /></SelectTrigger>
                  <SelectContent>
                    {(partners ?? [])
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>Full name</Label>
              <Input value={contactDraft.full_name ?? ""} onChange={(e) => setContact({ full_name: e.target.value })} />
            </div>
            <div>
              <Label>Job title</Label>
              <Input value={contactDraft.title ?? ""} onChange={(e) => setContact({ title: e.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={contactDraft.role_type ?? "commercial"} onValueChange={(v) => setContact({ role_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_ROLES.map((r) => <SelectItem key={r} value={r}>{prettyLabel(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={contactDraft.email ?? ""} onChange={(e) => setContact({ email: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={contactDraft.phone ?? ""} onChange={(e) => setContact({ phone: e.target.value })} />
            </div>
            <div>
              <Label>Preferred channel</Label>
              <Select value={contactDraft.preferred_channel ?? "email"} onValueChange={(v) => setContact({ preferred_channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c} value={c}>{prettyLabel(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Escalation order</Label>
              <Input
                type="number" min={1}
                value={contactDraft.escalation_order ?? ""}
                onChange={(e) => setContact({ escalation_order: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!contactDraft.is_primary} onCheckedChange={(v) => setContact({ is_primary: v })} />
                Primary contact
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={contactDraft.is_active !== false} onCheckedChange={(v) => setContact({ is_active: v })} />
                Active
              </label>
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={3} value={contactDraft.notes ?? ""} onChange={(e) => setContact({ notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactPartnerId(null)}>Cancel</Button>
            <Button
              onClick={submitContact}
              disabled={
                !contactDraft.full_name?.trim() ||
                (contactPartnerId === "__new__" && !contactDraft.partner_id) ||
                saveContact.isPending
              }
            >
              {saveContact.isPending ? "Saving…" : "Save contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerRelationshipsPanel;
