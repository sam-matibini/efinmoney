

# Plan: Create KNOWN_ISSUES.md Documentation

## Overview
Create a comprehensive `KNOWN_ISSUES.md` file documenting all hardcoded/non-functional features found across the app, organized by section, with remediation guidance for each.

## Issues Identified

### 1. Cards Section — Fully Hardcoded
- Cards stored in local `useState` with mock data (lines 38-61 of `CardsPage.tsx`)
- No database table for cards; no persistence across sessions
- "New Card" button has no create flow
- "Request Physical Card" button is non-functional
- Lock/freeze/edit/delete only work in-memory (lost on refresh)

### 2. Wallet Section — Receive Button Non-Functional
- `WalletCard.tsx` line 189-201: "Receive" button is a plain `<motion.button>` with no `onClick` handler or modal
- "Send" button correctly wraps in `<SendMoneyModal>`, but "Receive" does nothing

### 3. Exchange Tab — Crypto Buy/Sell Fails
- `CryptoTradingPanel.tsx`: The edge function call uses path `crypto-trading/pairs` (sub-path routing), which may not be supported by the edge function deployment
- FX Currency tab: Uses `fx-engine` edge function — same potential issue; also fallback hardcoded rates if no DB rates exist
- Both tabs show UI but actual execution likely fails silently or with errors

### 4. Send Page — Hardcoded Elements
- Bank accounts list (lines 194-202): Hardcoded "TD Chequing", "RBC Savings", "BMO Chequing"
- Credit cards list (lines 210-219): Hardcoded "Visa ••••5678", "Mastercard ••••9012"
- FX rates have hardcoded fallbacks (lines 50-54) if no DB rates
- Bank/card funding sources don't actually process payments

### 5. Dashboard — Hardcoded/Mock Data
- `RecentTransactions.tsx` lines 46-75: Falls back to hardcoded mock transactions when no real transfers exist
- `StatsOverview.tsx` line 47: Countries defaults to hardcoded "8" if no data
- `StatsOverview.tsx` line 31: "+12.5%" change is hardcoded, not calculated
- `StatsOverview.tsx` line 54: KYC status hardcoded as "Verified, Tier 3"

### 6. Header/Notifications — Non-Functional
- `Header.tsx` line 90: Search button has no handler
- `Header.tsx` line 93-96: Bell/notification icon shows a hardcoded red dot, no notification system
- Profile dropdown items (Profile Settings, KYC Verification, Security) have no linked pages

### 7. Dashboard Quick Actions — Placeholders
- `QuickActions.tsx`: "Deposit", "Mobile Money", "Pay Bills", "Savings" buttons are non-functional (no onClick or modal)

## File to Create
- **`KNOWN_ISSUES.md`** — Full documentation of each issue with:
  - Description of the problem
  - Affected files and line references
  - Severity (cosmetic, partial, non-functional)
  - Recommended fix approach (database table, edge function, modal, etc.)

## Technical Details
- Single markdown file creation, no code changes
- Organized by app section for easy navigation
- Includes a priority matrix (critical → low)

