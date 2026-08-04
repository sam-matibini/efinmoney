# Searchable, scrollable eFinMoney user dropdown

Turn the eFinMoney recipient search box into a proper combobox: clicking it immediately opens a scrollable list of eFinMoney users, and typing filters that list live (no 3-character minimum, no separate "Find" click required).

## What changes for the user

- Focus the recipient field → a dropdown opens right away showing recipients you can scroll through (recents first, then other eFinMoney users).
- Typing any character filters the list instantly; results keep scrolling in the same panel.
- Each row shows avatar, name, @tag, masked email, and an "Added" badge when already in the list; keyboard arrow-up/down + Enter selects.
- If nothing matches, the panel shows "No eFinMoney user found" with the existing Invite action.
- Recents chips and the Recents/Search toggle stay as they are today.

## Technical notes

- New database function `list_efin_recipients(p_query text, p_limit int, p_offset int)` — a paged directory lookup for signed-in users: same privacy rules as the existing `search_efin_recipients` (masked email, no self, rate-limited), but it also returns results when the query is empty, ordered by recent-counterparty first then name. Granted to `authenticated` only.
- `src/components/send/EfinRecipientQuickPick.tsx`:
  - Replace the `search_efin_recipients` query with `list_efin_recipients`, enabled whenever the dropdown is open (empty query allowed), debounced 250ms.
  - Open the panel on focus/click; keep the outside-click close behavior.
  - Scroll container stays `max-h-72 overflow-y-auto`; add infinite "load more" on scroll-to-bottom via offset paging.
  - Add keyboard navigation (ArrowUp/ArrowDown/Enter/Escape) and `role="listbox"`/`role="option"` semantics.
  - Keep the exact-match `lookup_efin_recipient` path on Enter when the input looks like a full email/account number, and keep the Find button as a fallback.
- Selection flow (`pick`) and the `QuickPickRecipient` shape, including `base_currency` defaulting, are unchanged, so `EfinmoneyP2PFlow` needs no edits.
