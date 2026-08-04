# Quick lookup for eFinMoney recipients

Today the eFinMoney tab only has a single search box with a "Find" button that resolves an **exact** email, @tag, or 10-digit account number. If the sender doesn't know the exact identifier, they can't find the person. This adds a quick-pick + type-ahead experience on the same form.

## What gets added

**1. Recent & saved recipients row (above the search box)**
- Avatar chips for the people this sender has paid in-network before (most recent first, up to 8), plus saved eFinMoney contacts.
- Tapping a chip adds that person straight to the recipient list — no typing, no Find click.

**2. Type-ahead suggestions in the search box**
- As the user types 3+ characters, matching eFinMoney users appear in a dropdown under the field (name, @tag, masked email, avatar).
- Selecting a suggestion adds the recipient immediately.
- The "Find" button stays for exact identifier paste, so nothing existing breaks.

**3. Empty / no-match states**
- "No eFinMoney user found — invite them" with a share-invite action, instead of a bare toast.

## Privacy rules for the suggestions

Partial-name search over all users can leak the user directory, so the suggestion query is deliberately constrained:
- Matches only on `efin_tag` prefix, email prefix (before `@`), or full account number — not free-text name search across all users.
- Returns at most 5 rows, with the email masked (`p•••r@gmail.com`) until the recipient is actually selected.
- Reuses the existing per-caller rate limit (30 lookups/min) and requires an authenticated caller.

Name-based search is still available, but only across the sender's own saved contacts and past counterparties, where they already have a relationship.

## Technical notes

- **New RPC** `search_efin_recipients(p_query text)` — security definer, `SET search_path = public`, auth check + `check_rate_limit`, prefix match on `efin_tag` / email local-part / account number, `LIMIT 5`, masked email column. `GRANT EXECUTE ... TO authenticated`. Existing `lookup_efin_recipient` is left untouched.
- **New RPC** `recent_efin_recipients()` — returns distinct counterparties from the caller's completed in-network P2P transfers (most recent 8), joined with saved eFinMoney contacts from `beneficiaries`. Caller-scoped by `auth.uid()`.
- **New component** `src/components/send/EfinRecipientQuickPick.tsx` — the chips row + debounced (250 ms) suggestion dropdown, built with existing shadcn `Command`/`Popover` primitives and semantic tokens.
- **Edit** `src/components/send/EfinmoneyP2PFlow.tsx` — render the quick-pick above the current search row and route both chip taps and suggestion picks into the existing `addRecipient` path (including the duplicate `isAlreadyAdded` guard and the sender self-send guard).
- No change to transfer, ledger, or fee logic.
