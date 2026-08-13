# Partner CRM: Contacts, Addresses & Agreement Documents

Add a proper relationship-management layer to each pricing partner: who we talk to, where they are, what we signed, and a log of interactions — all reachable from Partners & Pricing.

## What gets added

### 1. Partner contacts
Per partner, a list of people with:
- Name, job title, role type (commercial, technical/integration, support, compliance/AML, finance/settlement, executive)
- Email, phone, secondary phone, timezone, preferred channel
- Primary contact flag, escalation order (1 = first to call), active/inactive
- Notes

Actions: add, edit, deactivate, delete, mark primary, click-to-email/call, export to Excel.

### 2. Partner addresses
Per partner, structured addresses with a type (registered/legal, operations, billing, mailing):
- Street line 1 and 2, city, state/province, postal code, country (global ISO picker, same component already used elsewhere)
- Primary flag per type, plus a "same as registered address" copy action to avoid re-typing

### 3. Partner documents (agreements)
Uploads stored in a new private `partner-documents` storage bucket, with metadata:
- Document type: MSA/agreement, pricing schedule/rate card, amendment, NDA, SLA, compliance questionnaire, licence/registration, insurance, W-8/W-9 or tax form, KYB pack, other
- Title, file, version, signed date, effective date, expiry/renewal date, counterparty signer, status (draft / under review / executed / expired / superseded)
- Auto "expiring soon" badge (within 60 days) and an expired badge
- Download via short-lived signed URL; replace-with-new-version keeps history

### 4. Partner CRM activity log
Reuses the existing CRM activity pattern, scoped to partners:
- Type: call, email, meeting, negotiation, escalation, review, note
- Subject, body, occurred-at, logged-by, optional follow-up date and owner
- Optional link to a document or contact
- Open follow-ups surface at the top of the partner's CRM tab

## Where it appears

- **New "Contacts & CRM" tab** inside the existing Partner detail sheet (alongside Overview, Corridors, Rate card, Liquidity, Financial) — sub-tabs: Contacts, Addresses, Documents, Activity.
- **New "Relationships" tab** in Partners & Pricing giving a cross-partner view: all contacts in one searchable/sortable table, plus a "Documents needing attention" list (missing agreement, expiring, expired). Uses the existing table toolkit so search, filter, sort and Excel export work exactly like the other pricing tabs.
- Partners table gains small indicators: whether an executed agreement exists and whether a primary contact exists.

## Access control

- Contacts, addresses, documents and activity are admin-only (same reviewer/admin roles that already guard partner pricing).
- Banking stays where it is, behind the existing password gate. Documents are **not** password-gated by default, but the bucket is private and files are only reachable through signed URLs.

## Technical outline

New tables (each with GRANTs, RLS restricted to admin roles, `created_at`/`updated_at` + update trigger):
- `partner_contacts` — `partner_id` FK to `payment_partners`, name, title, role_type, email, phone, phone_alt, timezone, preferred_channel, is_primary, escalation_order, is_active, notes
- `partner_addresses` — `partner_id`, address_type, line1, line2, city, region, postal_code, country (ISO2), is_primary, notes
- `partner_documents` — `partner_id`, doc_type, title, file_path, file_name, mime_type, size_bytes, version, status, signed_date, effective_date, expiry_date, counterparty_signer, superseded_by, uploaded_by, notes
- `partner_crm_activities` — `partner_id`, activity_type, subject, body, occurred_at, contact_id, document_id, follow_up_at, follow_up_owner, created_by

Storage: private bucket `partner-documents`, path `{partner_id}/{uuid}-{sanitized filename}`, upload via existing `sanitizeStorageFilename` helper, download via `createSignedUrl`.

Frontend:
- `src/hooks/usePartnerCrm.tsx` — React Query hooks for the four tables plus upload/signed-URL helpers
- `src/components/settings/partners/crm/` — `PartnerContactsTab.tsx`, `PartnerAddressesTab.tsx`, `PartnerDocumentsTab.tsx`, `PartnerActivityTab.tsx`, and `PartnerRelationshipsPanel.tsx` for the cross-partner view
- Wire the new sheet tab into `PartnerDetailSheet.tsx` and the new panel into `PartnerNetworkPanel.tsx`
- Reuse `CountryCombobox`, `tableToolkit` (search/sort/export), shadcn dialogs — no new libraries

## Phases

1. Database + storage bucket and policies.
2. Hooks and Contacts + Addresses tabs in the partner sheet.
3. Documents tab: upload, versioning, expiry badges, signed download.
4. CRM activity log with follow-ups.
5. Cross-partner Relationships panel (search, sort, Excel export, attention list) and partner-table indicators.
