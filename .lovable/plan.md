## Goal
Embed the Reception AI (ElevenLabs) booking assistant at a dedicated `/book` page, reachable both publicly and from inside the app.

## What gets built

1. **New page `src/pages/BookPage.tsx`**
   - Renders the Reception AI iframe: `https://app.reception.ai/smb-public/book/efinmoney`, `allow="microphone"`, full-bleed inside the layout (not `position: fixed`, so the app's header/nav still work).
   - Lightweight header bar with the eFinMoney logo, page title ("Book a call"), and a back link.
   - Loading skeleton until the iframe fires `onLoad`, plus a fallback link ("Open the booking page in a new tab") if the embed is blocked.
   - SEO: title/meta description, single H1, canonical.

2. **Routing (`src/App.tsx`)**
   - Public route `/book` (lazy-loaded, alongside `/contact`, `/about`) so logged-out visitors and shared links work.
   - Signed-in users hitting `/book` get the same page; no auth guard.

3. **Entry points**
   - Marketing: "Book a call" button on the Contact page (and footer nav if one exists there).
   - In-app: a "Book a call" item in `MorePage` / Support section linking to `/book`.

## Technical notes
- The iframe needs `allow="microphone"`; browsers only grant mic in a secure context, which the preview and published domain both satisfy.
- Use the app's layout container rather than `position: fixed; inset: 0` so mobile bottom nav isn't covered; the iframe gets a viewport-height-minus-chrome height (`h-[calc(100dvh-…)]`).
- No backend, secrets, or database changes — pure frontend embed.
- Styling uses existing semantic tokens (dark theme, Space Grotesk headings), no hardcoded colors.

## Out of scope
- Any ElevenLabs SDK / `useConversation` integration — this is the hosted Reception AI page only.
- Storing bookings in the app's database (bookings live in Reception AI).
