# Known Issues & Technical Debt

> Last updated: 2026-04-11  
> This document catalogs all hardcoded, non-functional, or partially implemented features in the eFin Money app.

---

## Priority Matrix

| Priority | Section | Issue | Severity |
|----------|---------|-------|----------|
| 🔴 Critical | Exchange | Crypto buy/sell non-functional | Non-functional |
| 🔴 Critical | Exchange | FX currency swap non-functional | Non-functional |
| 🟠 High | Cards | Entire section is hardcoded mock data | Non-functional |
| 🟠 High | Wallets | "Receive" button does nothing | Non-functional |
| 🟠 High | Send | Funding sources are hardcoded | Non-functional |
| 🟡 Medium | Dashboard | Mock fallback data in transactions | Cosmetic |
| 🟡 Medium | Dashboard | Hardcoded stats (growth %, countries, KYC) | Cosmetic |
| 🟡 Medium | Quick Actions | 4 of 6 buttons are placeholders | Non-functional |
| 🟢 Low | Header | Notifications system non-functional | Cosmetic |
| 🟢 Low | Header | Search button non-functional | Non-functional |
| 🟢 Low | Header | Profile dropdown links lead nowhere | Non-functional |

---

## 1. Cards Section — Fully Hardcoded

**Status:** ❌ Non-functional (UI-only mock)

### Problem
The entire Cards page uses local React state with hardcoded mock data. Nothing persists to the database.

### Affected Files
- `src/pages/CardsPage.tsx` — lines 38–61: Mock card data in `useState`

### Specific Issues
1. **No database table** — There is no `cards` table in the schema. All card data lives in component state and is lost on page refresh.
2. **"Add New Card" button** — Opens no modal or creation flow; it's a dead button.
3. **"Request Physical Card" button** — Non-functional placeholder.
4. **Edit/Delete/Lock/Freeze** — These actions work in-memory only. Changes are lost on refresh since there's no persistence layer.

### Recommended Fix
1. Create a `cards` database table:
   ```sql
   CREATE TABLE public.cards (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     card_type TEXT NOT NULL DEFAULT 'virtual', -- 'virtual' | 'physical'
     card_network TEXT NOT NULL DEFAULT 'visa', -- 'visa' | 'mastercard'
     last_four TEXT NOT NULL,
     cardholder_name TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'frozen' | 'cancelled'
     spending_limit NUMERIC DEFAULT 5000,
     wallet_id UUID REFERENCES public.wallets(id),
     expires_at DATE NOT NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```
2. Add RLS policies for user-scoped access.
3. Create a `useCards` hook similar to `useWallets`.
4. Build an `AddCardModal` component for card creation.
5. Connect edit/delete/freeze actions to database mutations.

---

## 2. Wallet Section — Receive Button Non-Functional

**Status:** ❌ Non-functional

### Problem
On each wallet card, the "Send" button correctly opens `SendMoneyModal`, but the "Receive" button is a plain `<motion.button>` with no click handler.

### Affected Files
- `src/components/ui/WalletCard.tsx` — lines 189–201: Receive button markup

### Specific Issues
1. **No `onClick` handler** — The button renders but does nothing when clicked.
2. **No `ReceiveMoneyModal`** — There is no modal component for receiving/requesting money.
3. **No receive flow** — No QR code generation, no wallet address display, no payment request functionality.

### Recommended Fix
1. Create a `ReceiveMoneyModal` component that displays:
   - Wallet address or account details for the selected wallet
   - QR code for easy sharing (use a library like `qrcode.react`)
   - Copy-to-clipboard for wallet/account identifiers
   - Option to generate a payment request link
2. Wrap the Receive button with the new modal (same pattern as `SendMoneyModal`).

---

## 3. Exchange Tab — Crypto & FX Non-Functional

**Status:** ❌ Non-functional (UI renders, transactions fail)

### Problem
Both the Crypto and FX Currency tabs under Exchange display UI but cannot execute actual trades.

### Affected Files
- `src/components/crypto/CryptoTradingPanel.tsx` — Edge function calls to `crypto-trading`
- `src/pages/ExchangePage.tsx` — FX trading panel (lines 19–241)
- `supabase/functions/crypto-trading/index.ts` — Edge function handler
- `supabase/functions/fx-engine/index.ts` — Edge function handler

### Specific Issues

#### Crypto Tab
1. **Edge function routing** — The panel calls `crypto-trading` with body `{ action: 'pairs' }` and `{ action: 'execute' }`. The edge function may not correctly handle these action routes, causing silent failures.
2. **No wallet balance updates** — Even if the edge function responds, wallet balances may not update because the function may lack the logic to debit/credit wallets.
3. **Price data** — Crypto prices appear to come from the edge function but may return errors, falling back to empty state.

#### FX Currency Tab
1. **Hardcoded fallback rates** — `ExchangePage.tsx` line 39–40: If no DB rate is found, it defaults to `1.35` for USD→CAD or `1` for everything else. This means most currency pairs show a 1:1 rate.
2. **Edge function dependency** — The `fx-engine` edge function is called for execution but may fail silently.
3. **No rate refresh** — Rates are fetched once and not periodically updated.

### Recommended Fix
1. **Debug edge functions** — Check edge function logs for errors:
   - Verify the `crypto-trading` function handles the `action` field in the request body
   - Verify the `fx-engine` function correctly debits/credits wallets
2. **Add error handling** — Surface edge function errors to the user instead of failing silently.
3. **Seed FX rates** — Populate the `fx_rates` table with real rate data for all supported currency pairs so the hardcoded fallbacks are never needed.
4. **Add rate refresh** — Implement periodic rate polling or use Supabase Realtime on the `fx_rates` table.

---

## 4. Send Page — Hardcoded Funding Sources

**Status:** ⚠️ Partially functional

### Problem
The Send page can create transfer records in the database, but funding sources (bank accounts, credit cards) are hardcoded and don't process real payments.

### Affected Files
- `src/pages/SendPage.tsx` — lines 194–219: Hardcoded bank accounts and credit cards

### Specific Issues
1. **Hardcoded bank accounts** — "TD Chequing ••••4521", "RBC Savings ••••8834", "BMO Chequing ••••2219" are static strings with no connection to any banking API or database table.
2. **Hardcoded credit cards** — "Visa ••••5678" and "Mastercard ••••9012" are static strings.
3. **No payment processing** — Selecting a funding source and sending money creates a `transfers` record but does not actually move funds. There's no integration with Stripe, banking APIs, or mobile money providers.
4. **FX rate fallbacks** — Lines 50–54: Hardcoded rates (`1.35`, `0.74`, `110`, `1580`) are used when no database rates exist.
5. **Fee calculation** — The fee structure (lines 55–60) uses hardcoded percentages that should be configurable.

### Recommended Fix
1. **Link to `bank_accounts` table** — The database already has a `bank_accounts` table. Query user's linked accounts instead of using hardcoded data.
2. **Payment integration** — For real fund movement, integrate with:
   - Stripe for card payments
   - Banking APIs (Plaid, etc.) for bank transfers
   - Mobile money APIs (M-Pesa, MTN, Airtel) for mobile money payouts
3. **Dynamic fee/rate config** — Move fee percentages to a `pricing_config` table or use the existing `fx_rates` table more comprehensively.

---

## 5. Dashboard — Mock & Hardcoded Data

**Status:** ⚠️ Cosmetic / Partially functional

### Problem
Several dashboard widgets display hardcoded values instead of computed real data.

### Affected Files
- `src/components/dashboard/RecentTransactions.tsx` — lines 46–75
- `src/components/dashboard/StatsOverview.tsx` — lines 27–60

### Specific Issues

#### Recent Transactions
1. **Mock fallback data** — When no real transfers exist, the component displays 3 hardcoded fake transactions ("John Mwangi", "USD → CAD Exchange", "Alice Smith"). This is misleading for new users.

#### Stats Overview
1. **"+12.5%" growth** — Line 31: This percentage is hardcoded, not calculated from actual balance history.
2. **Countries count "8"** — Line 47: If no transfers exist with country data, it defaults to showing "8" countries, which is fabricated.
3. **KYC Status "Verified, Tier 3"** — Lines 54–56: Always shows "Verified" and "Tier 3" regardless of the user's actual KYC status in the `profiles` table.

### Recommended Fix
1. **Remove mock transactions** — Show an empty state with a CTA ("Send your first transfer") instead of fake data.
2. **Calculate growth** — Query balance snapshots over time or compare current vs. previous period balances.
3. **Dynamic KYC** — Read `kyc_status` and `kyc_tier` from the user's `profiles` record.
4. **Real country count** — Only show actual unique countries from the user's transfers, or show "0" with a prompt.

---

## 6. Header & Notifications — Non-Functional

**Status:** ❌ Non-functional

### Affected Files
- `src/components/layout/Header.tsx` — lines 88–120

### Specific Issues
1. **Search button** — The magnifying glass icon button has no `onClick` handler. No search functionality exists.
2. **Notification bell** — Shows a hardcoded red dot (implying unread notifications) but:
   - There is no `notifications` table in the database
   - No notification creation/delivery system exists
   - Clicking the bell does nothing
3. **Profile dropdown links** — "Profile Settings", "KYC Verification", and "Security" menu items don't navigate anywhere meaningful. No dedicated pages exist for these.

### Recommended Fix
1. **Notifications system:**
   - Create a `notifications` table with columns: `id`, `user_id`, `title`, `message`, `type`, `is_read`, `created_at`
   - Add RLS policies for user-scoped access
   - Create a notifications dropdown/panel showing real notifications
   - Generate notifications on events (transfer completed, KYC status change, etc.)
   - Use Supabase Realtime for live notification delivery
2. **Search** — Implement global search across transfers, wallets, and contacts.
3. **Profile pages** — Create dedicated pages for Profile Settings, KYC Verification, and Security, or link to existing settings sections.

---

## 7. Dashboard Quick Actions — Placeholders

**Status:** ❌ Non-functional (4 of 6 buttons)

### Affected Files
- `src/components/dashboard/QuickActions.tsx` — lines 29–71

### Specific Issues
| Button | Status | Notes |
|--------|--------|-------|
| Send Money | ✅ Working | Opens `SendMoneyModal` |
| Deposit | ❌ Placeholder | No `onClick`, no modal, no deposit flow |
| Exchange | ✅ Working | Opens `ExchangeModal` |
| Mobile Money | ❌ Placeholder | No `onClick`, no modal |
| Pay Bills | ❌ Placeholder | No `onClick`, no modal |
| Savings | ❌ Placeholder | No `onClick`, no modal |

### Recommended Fix
1. **Deposit** — Create a `DepositModal` showing bank transfer instructions, or integrate with a payment processor for card-based deposits.
2. **Mobile Money** — Create a `MobileMoneyModal` that initiates mobile money transactions (similar to Send but specifically for M-Pesa, MTN, Airtel flows).
3. **Pay Bills** — Create a `PayBillsModal` with bill payment categories and payee selection.
4. **Savings** — Create a savings/goals feature with a `SavingsModal` for creating savings goals and automated transfers.

---

## 8. Additional Hardcoded Elements

### Exchange Rates Widget (Dashboard)
- `src/components/dashboard/ExchangeRates.tsx` — May show empty state if no FX rates are seeded in the database.

### Mobile Navigation
- `src/components/layout/MobileNav.tsx` — Navigation works but some destination pages have the issues documented above.

### Wallet Carousel
- `src/components/dashboard/WalletCarousel.tsx` — Displays real wallet data from DB but the action buttons on cards inherit the WalletCard issues (non-functional Receive button).

---

## Implementation Roadmap

### Phase 1 — Critical Fixes (Exchange & Core Flows)
1. Debug and fix `crypto-trading` and `fx-engine` edge functions
2. Seed `fx_rates` table with comprehensive rate data
3. Add proper error handling/user feedback for failed trades
4. Fix Receive button on wallet cards

### Phase 2 — Data Persistence (Cards & Funding Sources)
1. Create `cards` table and migrate from hardcoded data
2. Link Send page funding sources to `bank_accounts` table
3. Remove mock transaction data; add empty states

### Phase 3 — Missing Features (Quick Actions & Notifications)
1. Build Deposit, Mobile Money, Pay Bills, Savings modals
2. Create notifications system (table, real-time, UI)
3. Build profile/settings/KYC pages

### Phase 4 — Polish (Dashboard Accuracy)
1. Calculate real growth percentages
2. Dynamic KYC status display
3. Global search functionality
4. Real country/recipient counts
