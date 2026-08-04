# Fill transfer-type tabs with full-cell color

## Goal

Replace the current text-only / icon-only color cues on the transfer-type tabs so each entire tab cell (Other / eFinMoney / Domestic) is filled with a friendly, distinct color. This makes the active transfer type instantly recognizable at a glance, matching the reference image where the tab bodies are solid yellow, green, etc.

## What will change

1. **Full-cell background per tab**
   - Each `TabsTrigger` gets a permanent tinted background that fills the whole cell, not just the icon badge or active text.
   - The active tab darkens/saturates the same hue so the active state is obvious; inactive tabs keep a lighter tint of the same hue.
   - Background colors use the existing payment-method semantic tokens (`--pay-bank`, `--pay-wallet`, `--pay-card`) with opacity for the inactive state and solid color for the active state.

2. **Icon and text contrast**
   - Icon and label use the corresponding `*-foreground` tokens (or white/ink) on both inactive and active states so they remain readable.
   - Remove the small colored ring/background icon badges; the whole cell now carries the color, so the badges are redundant.

3. **Sliding pill**
   - Keep the motion affordance but make it subtle: the pill becomes a slightly lighter inset highlight or border stroke so the colored cell still reads clearly while the animated slide persists.

4. **Scope and alignment stay the same**
   - Tab strip width remains `max-w-lg mx-auto` and the two/three-column grid is unchanged.
   - Tab labels and routing values stay the same ("Other", "eFinMoney", "Domestic").

## Implementation

- In `src/pages/SendPage.tsx` (around lines 2036–2082), update the `TabsTrigger` classes for `international`, `efinmoney`, and `canada`:
  - Assign a base background color per tab (e.g., `bg-pay-bank/20` for Other, `bg-pay-wallet/20` for eFinMoney, `bg-pay-card/20` for Domestic).
  - Active state fills the cell (`data-[state=active]:bg-pay-bank`, `data-[state=active]:text-pay-bank-foreground`, etc.).
  - Remove or simplify the per-tab icon-badge spans so the colored cell itself is the identifier.
- Adjust the sliding `motion.div` pill so it acts as a focus ring or border highlight instead of a solid white background.

## Verification

- Visual check in the preview for all three tabs (when Canada tab is visible and when it is not).
- Confirm text remains readable in both light and dark modes.
- Confirm no hardcoded hex values are introduced — all colors come from the existing `--pay-*` tokens.
