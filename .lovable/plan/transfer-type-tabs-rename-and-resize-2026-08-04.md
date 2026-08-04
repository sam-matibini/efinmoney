# Transfer type tabs: rename and resize

## 1. Rename "International" to "Other"

The first transfer-type tab label becomes "Other". The globe icon, tab value, routing and all send logic stay exactly as they are — only the visible word changes.

## 2. Fit and align the tab row

Today the tab strip spans the full page width while the transfer form below it sits in a narrower centered card. The strip shrinks to the same width as the form and centers under the "Send Money" heading:

```text
                 Send Money
          Send money to 150+ countries

        [  Other  |  eFinMoney  ]      <- same width as form card
        +-------------------------+
        |     transfer form       |
```

- Tab strip width matches the money-flow card (max-w-lg, centered), so the two edges line up.
- Tab height and padding tighten slightly so each label sits snugly around its text.
- The sliding highlight pill keeps its current animation and still measures correctly, since the columns remain equal halves (or thirds when the Domestic tab is live).

## Technical notes

- All changes in `src/pages/SendPage.tsx` at the `Tabs`/`TabsList` block (~lines 2025-2079): change the `international` trigger's label text to "Other", and add `mx-auto max-w-lg` plus a slightly reduced height to the `TabsList` className.
- No change to tab `value`s, `searchParams` mode handling, the `canadaLive` three-column case, or any send logic.
