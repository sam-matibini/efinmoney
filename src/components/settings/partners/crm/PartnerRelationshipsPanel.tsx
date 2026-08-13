import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Mail, Phone, Users } from "lucide-react";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import { useTableQuery, type Col } from "../tableToolkit";
import { countryLabel } from "../CountryCombobox";
import {
  docExpiryState,
  prettyLabel,
  usePartnerAddresses,
  usePartnerContacts,
  usePartnerDocuments,
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

/** Cross-partner view of every contact, plus documents needing attention. */
export const PartnerRelationshipsPanel = () => {
  const { data: partners, isLoading: partnersLoading } = usePaymentPartners();
  const { data: contacts, isLoading: contactsLoading } = usePartnerContacts();
  const { data: docs } = usePartnerDocuments();
  const { data: addresses } = usePartnerAddresses();

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
    const out: { partner: string; issue: string; detail: string }[] = [];
    for (const p of partners ?? []) {
      const pDocs = (docs ?? []).filter((d) => d.partner_id === p.id);
      const executed = pDocs.filter((d) => d.status === "executed");
      if (!executed.length) {
        out.push({ partner: p.name, issue: "No executed agreement", detail: "Upload the signed contract" });
      }
      for (const d of executed) {
        const state = docExpiryState(d.expiry_date);
        if (state === "expired") {
          out.push({
            partner: p.name,
            issue: "Agreement expired",
            detail: `${d.title} · ${new Date(d.expiry_date!).toLocaleDateString()}`,
          });
        } else if (state === "soon") {
          out.push({
            partner: p.name,
            issue: "Renewal due soon",
            detail: `${d.title} · ${new Date(d.expiry_date!).toLocaleDateString()}`,
          });
        }
      }
      if (!(contacts ?? []).some((c) => c.partner_id === p.id && c.is_primary && c.is_active)) {
        out.push({ partner: p.name, issue: "No primary contact", detail: "Add a commercial owner" });
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
                  <span className="text-xs text-muted-foreground">{a.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> All partner contacts
          </CardTitle>
          <CardDescription>
            Search, filter, sort and export every contact across the partner network. Edit them from a partner's
            detail view.
          </CardDescription>
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
              No partner contacts yet — open a partner and add one under Contacts &amp; CRM.
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
    </div>
  );
};

export default PartnerRelationshipsPanel;
