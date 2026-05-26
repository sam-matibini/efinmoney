## Goal

Replace long, parameter-laden URLs (e.g. `…lovableproject.com/send?sourceWalletId=9cafea5c-…`) with clean branded short links like `https://efin.money/s/AbC123`. Visiting the short link transparently routes to the real in-app destination with all original params intact.

Works for every shareable route in the app (send, receive, transfer tracking, statements, receipts, P2P, etc.) — not just `/send`.

## What the user will see

- Anywhere the app builds a shareable URL today, it instead shows `https://efin.money/s/<code>`.
- "Copy link", "Share", QR codes, emailed receipts, and SMS notifications all use the short form.
- Clicking the short link opens the app and lands on the exact same screen the long URL would have opened, with the same data preloaded.
- Codes are short (6–8 chars), URL-safe, and case-sensitive.

## How it works

```text
User clicks "Share" 
   → app calls create_short_link({ path: "/send", params: { sourceWalletId: "..." } })
   → backend stores row + returns code "AbC123"
   → UI displays https://efin.money/s/AbC123

Recipient opens https://efin.money/s/AbC123
   → React route /s/:code mounts a Resolver component
   → Resolver calls resolve_short_link(code)
   → backend returns { path: "/send", params: {...} }, increments click counter
   → Resolver does navigate("/send?sourceWalletId=...", { replace: true })
   → User lands on real screen; address bar still shows /s/AbC123 briefly then switches
```

Optional toggle per link: keep the `/s/<code>` URL in the address bar (no rewrite) for cleanliness, or rewrite to the real path. Default: **keep `/s/<code>`** so it stays shareable on refresh.

## Database

New table `public.short_links`:

| column | type | notes |
|---|---|---|
| `code` | text PK | 6–8 chars, base62 |
| `owner_id` | uuid | creator; nullable for system links |
| `target_path` | text | e.g. `/send`, `/transfers/:id` |
| `params` | jsonb | query + path params |
| `expires_at` | timestamptz | nullable; default null = never |
| `max_uses` | int | nullable |
| `use_count` | int | default 0 |
| `created_at` | timestamptz | default now() |
| `revoked_at` | timestamptz | nullable |

RLS:
- `authenticated` can insert their own (`owner_id = auth.uid()`)
- Anyone (anon + authenticated) can read a single row via the `resolve_short_link(code)` security-definer function only — no direct `SELECT` grant to anon. Owners can `SELECT` their own rows for a "My links" view later.
- Owners can revoke (`UPDATE revoked_at`).

Two RPCs:
- `create_short_link(target_path, params, expires_at?, max_uses?) → code` — generates a collision-checked base62 code, rate-limited via existing `check_rate_limit`.
- `resolve_short_link(code) → { target_path, params }` — validates not revoked / not expired / under `max_uses`, increments `use_count`, returns target.

## Frontend

1. **New route** `/s/:code` in `App.tsx` → `<ShortLinkResolver />` component.
   - Calls `resolve_short_link`, then `navigate(target, { replace: true })` (or keeps `/s/:code` and renders the target component inline — pick at implementation).
   - Shows a 200ms branded spinner, then the page.
   - Invalid / expired / revoked → friendly "Link no longer available" screen.

2. **New helper** `src/lib/shortLink.ts`:
   ```ts
   shortenUrl(path: string, params?: Record<string, string>): Promise<string>
   // returns "https://efin.money/s/AbC123"
   ```
   Picks the public host from `window.location.origin` if it's already `efin.money`, otherwise hardcodes `https://efin.money`.

3. **Update share surfaces** (one batch):
   - SendPage / wallet share buttons → use `shortenUrl("/send", { sourceWalletId })`
   - ReceivePage share / QR
   - TransferTrackingPage "Copy link"
   - WalletStatementPage share
   - PDF receipt link in `generate-receipt` edge fn
   - Any future `navigator.share` / `clipboard.writeText` of an in-app URL

   Long internal `<Link to="/send?...">` navigation is unchanged — short links are only for external sharing.

## Edge cases handled

- **Rate limiting**: per-user cap on `create_short_link` calls via existing `check_rate_limit`.
- **Collisions**: retry loop up to 5 attempts, then 8-char code.
- **Privacy**: `params` may contain wallet ids — RLS prevents enumeration; codes are unguessable.
- **Expiry**: receipts/statements get 30-day expiry; send/receive links never expire by default.
- **Custom domain**: links only look pretty on `efin.money`. On the preview domain they'll show `id-preview--…lovable.app/s/AbC123` — still works, just not as branded.

## Out of scope (can add later)

- Analytics dashboard for link clicks
- Custom vanity codes (`/s/my-rent`)
- Password-protected links
- Open Graph preview metadata per link

## Technical notes (for the agent)

- Single migration creates `short_links` table + both RPCs + RLS + GRANTs.
- Two RPCs are SECURITY DEFINER with `search_path=public`.
- Code generator: `encode(gen_random_bytes(6), 'base64')` stripped to base62, sliced to 6 chars.
- Update `mem://features/` with a new `short-links` memory entry.
