import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { BENEFICIARY_COUNTRIES } from "@/components/modals/AddBeneficiaryModal";
import type { Beneficiary } from "@/hooks/useBeneficiaries";
import { payoutPartnerLabel } from "@/lib/payoutPartner";

interface Props {
  contact: Beneficiary | null;
  onOpenChange: (open: boolean) => void;
  onSend: (c: Beneficiary) => void;
  onEdit: (c: Beneficiary) => void;
  onDelete: (c: Beneficiary) => void;
}

const Row = ({ label, value }: { label: string; value?: string | null }) => {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-words">{value}</span>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    <div>{children}</div>
  </div>
);

export default function ContactDetailsSheet({
  contact, onOpenChange, onSend, onEdit, onDelete,
}: Props) {
  const c = contact;
  const country = c ? BENEFICIARY_COUNTRIES.find((x) => x.code === c.country_code) : undefined;

  return (
    <Sheet open={!!c} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {c && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-display font-bold shrink-0">
                  {c.avatar_initials || c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{c.nickname || c.name}</SheetTitle>
                  <SheetDescription className="truncate">
                    <span aria-hidden className="mr-1">{country?.flag || "🌍"}</span>
                    {country?.country || c.country_code || "Unknown country"}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <Section title="Contact">
                <Row label="Full name" value={c.name} />
                <Row label="Nickname" value={c.nickname} />
                <Row label="Category" value={c.category} />
                <Row label="Phone" value={c.phone} />
                <Row label="Telephone" value={c.tel} />
                <Row label="Email" value={c.email} />
                <Row label="Interac email" value={c.interac_email} />
              </Section>

              <Section title="Payout details">
                <Row label="Method" value={c.bank_account ? "Bank transfer" : "Mobile money"} />
                {!c.bank_account && <Row label="Payout partner" value={payoutPartnerLabel(c)} />}
                <Row label="Bank" value={c.bank_name} />
                <Row label="Account" value={c.bank_account} />
                <Row label="Bank code" value={c.bank_code} />
                <Row label="Currency" value={c.currency_code} />
              </Section>

              {(c.eft_institution || c.eft_transit || c.eft_account || c.eft_account_holder) && (
                <Section title="EFT">
                  <Row label="Institution" value={c.eft_institution} />
                  <Row label="Transit" value={c.eft_transit} />
                  <Row label="Account" value={c.eft_account} />
                  <Row label="Account holder" value={c.eft_account_holder} />
                </Section>
              )}

              {(() => {
                const a: any = c;
                const compose = (street?: string | null, city?: string | null, region?: string | null, postal?: string | null, cc?: string | null) =>
                  [street, [city, region].filter(Boolean).join(", "), postal, cc].filter(Boolean).join(" · ") || null;
                const main = compose(a.address, a.address_city, a.address_region, a.address_postal_code, a.address_country_code);
                const mailing = compose(a.mailing_address, a.mailing_city, a.mailing_region, a.mailing_postal_code, a.mailing_country_code);
                if (!main && !mailing) return null;
                return (
                  <Section title="Address">
                    <Row label="Address" value={main} />
                    <Row label="Mailing address" value={mailing === main ? "Same as address" : mailing} />
                  </Section>
                );
              })()}

              <Section title="Activity">
                <Row
                  label="Transfers"
                  value={`${c.transfer_count} transfer${c.transfer_count === 1 ? "" : "s"}`}
                />
                <Row
                  label="Last sent"
                  value={c.last_sent_at
                    ? formatDistanceToNow(new Date(c.last_sent_at), { addSuffix: true })
                    : "Never"}
                />
              </Section>

              {c.notes && (
                <Section title="Notes">
                  <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
                </Section>
              )}

              {c.tags?.length > 0 && (
                <Section title="Tags">
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {c.tags.map((t) => (
                      <Badge key={t} variant="secondary">{t}</Badge>
                    ))}
                  </div>
                </Section>
              )}

              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-1" onClick={() => onSend(c)}>
                  <Send className="w-4 h-4" /> Send money
                </Button>
                <Button variant="outline" className="gap-1" onClick={() => onEdit(c)}>
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
                <Button variant="outline" aria-label="Delete contact" onClick={() => onDelete(c)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
