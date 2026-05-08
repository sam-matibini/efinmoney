## Goal

Surface the full card credentials (number, expiry MM/YY, CVV) on the Cards page so users can copy them into Plaid / bank linking flows.

## Changes

### `src/pages/CardsPage.tsx`
- Use `expiry_month` / `expiry_year` from the DB when available, falling back to `expires_at`.
- Add a CVV row beside Expires that masks as `•••` and reveals when the same eye toggle is active. Reveal currently controls the PAN — extend it to also reveal CVV.
- Add a small "Copy card details" button on each card that copies `Number / MM/YY / CVV` to the clipboard (uses existing toast).
- For legacy cards created before this change (no stored PAN/CVV), keep the masked `•••• last_four` display and hide the copy button.

No DB or hook changes — fields already exist from the previous migration.
