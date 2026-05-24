## Add Interac e-Transfer tagline to Send and Receive

Add the official copy: *"Securely send and receive your money anytime, to any Canadian bank account with Interac e-Transfer."*

### Changes

**1. `src/components/send/CanadaSendFlow.tsx`**
Under the "Delivery Method" grid (after the 3 method buttons around line 460), when `method === "interac"`, show a small muted helper line with the tagline.

**2. `src/pages/ReceivePage.tsx`**
Add a new Interac e-Transfer info card (above or below the "Receive from another eFinMoney user" card) with the Interac® brand color accent, displaying the tagline and noting the user's account email/alias used for incoming e-Transfers.

### Out of scope
No logic changes, no new edge functions — copy + presentational card only.