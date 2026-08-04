# Add sender currency flag in the send/receive row

The "THEY RECEIVE" side shows a flag because it uses the currency picker, but the "YOU SEND" side renders only the plain currency code (e.g. CAD) with no flag.

## Change

In `src/components/fx/LiveFxCalculator.tsx`, inside the `pairLayout` block (the Sendwave-style paired row), render the existing local `Flag` component immediately before the `{from}` currency code in the "You send" cell, matching the size and spacing used on the receive-side picker.

No other flows or logic change; the same paired layout is used by the send form, so the fix applies wherever the sender currency appears in that row.
