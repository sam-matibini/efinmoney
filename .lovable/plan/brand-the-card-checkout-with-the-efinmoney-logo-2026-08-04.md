# Brand the card checkout with the eFinMoney logo

Today the checkout footer shows a hand-drawn green square with a letter "e" instead of the real logo, and the form itself has no brand header. Swap in the actual eFinMoney mark and wordmark.

## What changes

In `src/components/payments/FlutterwaveCardForm.tsx`:

1. **Footer badge** — `EfinmoneyBranding()` currently renders a fake `e` tile. Replace it with the real `<Logo static className="h-5 w-5" />` plus the `<Wordmark subtle />` from `src/components/Logo.tsx`, keeping the "Payment powered by" caption and the same size/spacing so the layout doesn't shift.

2. **Brand header on the form** — add a small header row above the card fields: the static logo, the wordmark, and a "Secure checkout" lock line on the right, separated by a hairline border. Keeps the payment sheet recognisably eFinMoney at the point of card entry.

3. **Processing overlay** — the "Verifying your identity" overlay already says "Secured by eFinMoney"; put the static logo next to that lock line so the brand carries through the loading and challenge stages.

All colours come from existing semantic tokens/brand classes already used by `Logo`/`Wordmark`. Logo uses `static` variant in the header and footer so there is no float or spin animation inside a payment form.

## Out of scope

No change to charge logic, fees, challenge handling, or any other checkout card component.
