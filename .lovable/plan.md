# Add a "View" button to contacts

Today each contact row only offers Send, a pencil (edit), and a trash icon. Nothing shows the full saved details, so users must open the edit form to check a phone number, bank account, or address.

## What will change

- A **View** button (eye icon) is added to every contact in both grid and list views, next to Send/Edit/Delete.
- Tapping the contact row/card itself also opens the view — same as pressing View.
- View opens a **contact details panel** (side sheet on desktop, bottom sheet on mobile) showing everything saved for that contact:
  - Name, nickname, country flag + country, avatar initials
  - Payout method (Mobile Money network / Bank + bank name, account, bank code) and currency
  - Phone, email, tel, Interac email
  - EFT details (institution, transit, account, account holder) when present
  - Mailing address / address / city, notes and tags
  - Activity: transfer count and last sent
- Empty fields are hidden so the panel stays clean.
- The panel footer has the same three actions: **Send money**, **Edit** (opens the existing add/edit modal prefilled), **Delete** (opens the existing confirm dialog). Editing from the panel closes it and reopens the modal, so updating details is one tap from viewing them.

## Technical notes

- New component `src/components/contacts/ContactDetailsSheet.tsx` using the existing `ui/sheet` primitives, taking `contact: Beneficiary | null`, `onOpenChange`, and `onSend` / `onEdit` / `onDelete` callbacks.
- `src/pages/ContactsPage.tsx` gains a `viewing: Beneficiary | null` state; the sheet's callbacks reuse the existing `handleSendTo`, `setEditing`/`setModalOpen`, and `setDeleting` handlers — no data-layer or hook changes.
- Detail rows read straight off the existing `Beneficiary` type from `useBeneficiaries`; no schema or query changes.
- Presentation-only change; icon-only buttons get `aria-label`s and row/card click targets stay keyboard accessible.
