# eFinMoney Users: Recents / Search Toggle

Add a two-option toggle to the "Send to eFinMoney users" block so the user picks between browsing recent recipients and searching for a new one, instead of both stacked on screen.

## Behaviour

- A small segmented toggle sits on the header row, right-aligned next to "Send to eFinMoney users": **Recents** | **Search**.
- Default mode is **Recents** when the user has recent recipients; otherwise it opens on **Search**.
- **Recents**: shows only the avatar chip row. Tapping a chip adds the recipient (unchanged).
- **Search**: shows only the search input + Find button, type-ahead dropdown, not-found alert and Invite action (unchanged). Input auto-focuses when switching to Search.
- Switching back to Recents clears the pending query and closes the suggestion dropdown.
- After a recipient is picked from search, the block returns to Recents mode.

## Technical

- File: `src/components/send/EfinRecipientQuickPick.tsx`.
- Add `mode` state (`"recents" | "search"`), initialised from whether recents exist once the query resolves.
- Render the toggle with the existing shadcn `Tabs`/`ToggleGroup` pattern used elsewhere, styled with semantic tokens (no hardcoded colours).
- Conditionally render the existing recents block and search block on `mode`; no changes to RPC calls, `pick()`, invite, or props.
