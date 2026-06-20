# Botswana (BWP) Localization

Add Botswana as a first-class corridor so users can hold, exchange, send to, and receive in Botswana Pula (BWP).

## 1. FX feed
- `supabase/functions/refresh-fx-rates/index.ts`: add `BWP` to `SUPPORTED`. After deploy, run the function once so cross-rates for BWP↔USD/CAD/EUR/GBP/NGN/KES/ZAR/etc. populate `fx_rates`.
- `FxTicker` / `LiveFxCalculator` will pick BWP up automatically once rates exist.

## 2. Currency + symbol
- `src/lib/currency.ts`: add `BWP: "P"` to `SYMBOLS` and `BW: "BWP"` to `COUNTRY_CCY`.
- `currencies` table already has BWP (seeded). No migration needed.

## 3. Country / payout config
- `src/lib/countries.ts`: upgrade the existing Botswana entry to expose mobile-money networks and a bank fallback:
  - Orange Money Botswana (`orange_money`)
  - Mascom MyZaka (`myzaka`)
  - BTC Smega / e-Pula (`smega`)
  - Bank transfer (`bank`) as fallback
  - `method: "Mobile Money / Bank"`, `symbol: "P"`, `dialCode +267`.
- `src/lib/mobileMoneyNetworks.ts`: add `BW` entry with the three MNOs above and dial code `+267`.

## 4. Payout routing
- `supabase/functions/pawapay-payout/index.ts`: add `BW` to the correspondent table and `BWP: "BW"` to `currencyFallback`. Tokens (subject to PawaPay enabling the corridor for our account):
  - `ORANGE: "ORANGE_BWA"`, `MYZAKA: "MYZAKA_BWA"`, `SMEGA: "SMEGA_BWA"`, `DEFAULT: "ORANGE_BWA"`.
  - If PawaPay has not yet activated Botswana for our merchant, the bank-transfer route via Flutterwave (already country-agnostic for BWP bank payouts) remains the working default.
- `supabase/functions/flutterwave-payout/index.ts`: no code change needed — it already accepts `BW`/`BWP` bank payouts; we just need it reachable from the new country option.

## 5. New user defaults (optional but recommended for the launch market)
- For users whose country = Botswana, auto-create a BWP wallet on signup in `handle_new_user()` alongside USD/CAD. Implemented as a small migration that adds a BWP wallet when `profiles.country_code = 'BW'`.

## 6. KYC / tier limits
No change — Botswana users follow the same tiered limits in `tier_limits`. Persona & Sumsub already accept BW IDs (passport / national ID / driving licence).

## 7. UI surfaces that will reflect Botswana automatically once the above lands
- Send flow country picker (`SendPage`, `AddBeneficiaryModal`, `ContactsPickerModal`)
- Exchange (wallet selector + `LiveFxCalculator`)
- Wallets page (Create Wallet → BWP option)
- FX ticker on landing & send pages
- Receipts / statement formatting (symbol "P")

## 8. Verification
- Run `refresh-fx-rates` and confirm BWP rows in `fx_rates`.
- In the preview, open Exchange and verify USD→BWP and BWP→USD quote.
- Open Send → pick Botswana → confirm network options and that a test transfer reaches `pawapay-payout` (or `flutterwave-payout` for bank) without "unsupported country" errors.

## Technical notes
- PawaPay corridor tokens for BWA are listed per their MNO catalog; if their sandbox rejects them for our account we'll log a clear "corridor not enabled" message and fall back to bank payout. No schema change required for fallback.
- All values are config/code changes — no destructive DB migrations.
