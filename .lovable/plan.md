## Goal

Allow Zambia (ZMW) recipients to receive funds on **MTN**, **Airtel**, or **Zamtel** mobile money. Currently the SendPage forces every Zambian payout to MTN because `countries.ts` exposes a single `payout: "mtn_mobile"` per country and there is no UI selector.

## Changes

### 1. Country config — multi-network for Zambia (`src/lib/countries.ts`)

Extend the country object with an optional `networks` array. For Zambia:

```ts
networks: [
  { id: "mtn",    label: "MTN Mobile Money",    payout: "mtn_mobile" },
  { id: "airtel", label: "Airtel Money",        payout: "airtel_money" },
  { id: "zamtel", label: "Zamtel Kwacha",       payout: "zamtel_money" },
]
```

Other countries keep their single-method behaviour (the new field is optional).

### 2. SendPage — network picker (`src/pages/SendPage.tsx`)

In step 2 of the send flow (above the "Mobile Money Number" field), when `targetCountry.networks` exists, render a small 3-button radio group: **MTN / Airtel / Zamtel** (with brand-colored chips). Default to the first option.

The selected network drives:
- `payout_method` saved on the transfer (replaces the static `targetCountry.payout`)
- The "Funds will be sent via …" hint text
- The pre-fill in the AddBeneficiaryModal save-contact dialog

For non-Zambia countries the picker is hidden and behaviour is unchanged.

### 3. Network mapping — add Zamtel (`supabase/functions/execute-transfer/index.ts`)

Extend `networkMap` so the new payout method resolves to the Flutterwave network identifier:

```ts
zamtel_money: "zamtel",
zamtel: "zamtel",
```

### 4. Flutterwave bank code — add Zamtel (`supabase/functions/flutterwave-payout/index.ts`)

Extend `NETWORK_MAP`:

```ts
"ZMW:zamtel": "ZAMTEL",
```

(MTN and Airtel for ZMW are already wired.)

### 5. Beneficiaries (existing) — no schema change

`beneficiaries.network` already exists and accepts free text. Saved Zambia contacts will now persist with their chosen network so subsequent sends auto-pick the right one. The picker on SendPage will respect a beneficiary's saved network if present.

## Out of Scope

- No DB migration (network field already exists on beneficiaries).
- No changes to FX rate logic — ZMW rate is unchanged across networks.
- No new edge function. Auto-refund on failure (already shipped) covers Zamtel too.

## Verification

1. `/send` → pick Zambia → step 2 shows MTN | Airtel | Zamtel chips.
2. Choose Zamtel, enter a Zambian number, send a small test amount.
3. Check `transfers.payout_method = 'zamtel_money'` and the `flutterwave-payout` request log shows `account_bank: "ZAMTEL"`.
4. Existing MTN/Airtel sends keep working unchanged.
