# Activate sender card fields in Canada Send flow

## Problem
The card number / expiry / CVC inputs render as empty boxes and can't be focused or typed into.

Console shows the root cause:
> Unsupported prop change on Elements: You cannot change the `stripe` prop after setting it.

In `src/components/send/CanadaSendFlow.tsx`, `<Elements>` is mounted with `Promise.resolve(null)` on first render, then `useEffect` swaps in the real Stripe promise. Stripe Elements ignores any change to its `stripe` prop after the first render, so the iframes never attach — the fields look like plain disabled boxes.

## Fix
Initialize the Stripe promise **synchronously** with the lazy form of `useState`, so `<Elements>` is mounted once with the real promise:

```tsx
const CanadaSendFlow = () => {
  const [stripeP] = useState<Promise<Stripe | null>>(() => getStripe());
  return (
    <Elements stripe={stripeP}>
      <CanadaSendFlowInner />
    </Elements>
  );
};
```

Remove the `useEffect` + nullable state, and drop the now-unused `useEffect` import line for that purpose.

`getStripe()` already memoizes its internal promise (singleton in `src/lib/stripe.ts`), so calling it during render is safe and won't refetch the publishable key on re-renders.

## Scope
- File touched: `src/components/send/CanadaSendFlow.tsx` only
- No edge functions, no DB, no other UI changes
- Existing tokenization, charge, and payout logic remain unchanged

## Verification
After the change, on `/send?mode=canada` step 2 with "Pay with card" selected:
- Card Number / Expiry / CVC fields accept focus and input
- The "Send …" button enables once a complete test card (e.g. `4242 4242 4242 4242`) is entered
- No more "Unsupported prop change on Elements" warning in the console