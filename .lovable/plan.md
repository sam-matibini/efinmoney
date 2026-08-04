# Unique avatar colors per eFinMoney user

Give every recipient avatar its own consistent color, so the same person always shows the same badge color everywhere in the eFinMoney flow (recent recipient chips, search dropdown rows, added-recipient list).

## What changes

- Each user gets a color derived from their user ID, so it never changes between sessions or screens.
- A curated palette of 10 distinct, accessible badge colors (tinted background + matching darker text) is used, defined as design tokens so it works in light and dark mode.
- Users with a real profile photo keep the photo; the color only applies to initials.

## Technical notes

- Add an `avatarPalette` helper (e.g. `src/lib/avatarColor.ts`): stable string hash of `user_id` → index into a fixed palette array of Tailwind class pairs backed by new semantic tokens in `src/index.css` / `tailwind.config.ts` (`--avatar-1` … `--avatar-10`, each with a foreground pair). No hardcoded hex/`bg-[#...]` in components.
- Update the local `Avatar` component in `src/components/send/EfinRecipientQuickPick.tsx` to accept a `seed` (the user id) and apply the palette classes instead of the fixed `bg-primary/15 text-primary`.
- Pass the seed at the two call sites: recents chips (line ~304) and search result rows (line ~393).
- Apply the same helper to the selected-recipient avatars in `src/components/send/EfinmoneyP2PFlow.tsx` if avatars are rendered there, for consistency.
