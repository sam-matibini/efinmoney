## Add Zamtel (and complete Zambia network list) to the Send flow

### What's already in place
- **Backend payout** (`flutterwave-payout/index.ts`) already maps `ZMW:mtn → MTN`, `ZMW:airtel → AIRTEL`, **`ZMW:zamtel → ZAMTEL`**.
- **Collections** (`flw-initialize-payment/index.ts`) and `execute-transfer/index.ts` already accept `zamtel`.
- `src/lib/countries.ts` Zambia config already lists MTN, Airtel, Zamtel.

### What's missing
The mobile-money network picker the Send modal renders from `src/lib/mobileMoneyNetworks.ts` only has **MTN** and **Airtel** for Zambia — Zamtel never appears in the dropdown, so users can't select it even though every layer below supports it.

### Fix (frontend only — one file)
Edit `src/lib/mobileMoneyNetworks.ts`, Zambia entry:
```ts
{ code: "ZM", name: "Zambia", flag: "🇿🇲", currency: "ZMW", dialCode: "+260", networks: [
  { value: "MTN",    label: "MTN MoMo" },
  { value: "AIRTEL", label: "Airtel Money" },
  { value: "ZAMTEL", label: "Zamtel Kwacha" },
]},
```

That's the only change needed — the existing backend mapping (`ZMW:zamtel → ZAMTEL`) already handles the new option end-to-end.

### Out of scope
Flutterwave's V4 payout API for Zambia currently lists MTN, Airtel, and Zamtel as the supported MNOs — there are no other operators to add. If Flutterwave later supports more, we add them in the same place.