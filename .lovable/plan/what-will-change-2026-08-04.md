Add distinct, high-visibility color cues to the Send Money transfer-type tabs (Other / eFinMoney / Domestic) so each tab is instantly recognizable.

### What will change
- In `src/pages/SendPage.tsx`, style each `TabsTrigger` with a unique accent color that appears on both the icon badge and the label text when active/inactive.
- Use existing semantic tokens rather than hardcoded hex values so the tabs remain theme-aware.
- Keep the sliding pill background animation intact.

### Proposed color mapping
- **Other** (international cross-border): `pay-bank` (sky blue) — signals global/foreign transfers.
- **eFinMoney** (internal P2P): `pay-wallet` (emerald green) — signals in-network wallet movement.
- **Domestic** (Canada): `pay-card` or a maple red accent derived from `--primary` — signals local/domestic rails.

### Implementation details
- Add per-tab color variants on the icon badge (e.g., `bg-pay-bank/15 text-pay-bank` for Other).
- Add a subtle underline or tint on the active label text so the color difference is visible even at a glance.
- Ensure contrast passes in both light and dark modes by using the existing `*-foreground` tokens.
- Leave tab logic, widths, and sliding pill unchanged.

### Verification
- Visual check in the preview for all three tabs (when Canada is live and when it is not).
- Confirm no hardcoded colors are introduced.
