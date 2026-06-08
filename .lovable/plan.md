# Fix: Unable to log out

## Diagnosis

Auth logs show the user's `POST /logout` calls returning **403 `session_not_found`** for session `20cc3adc-…` (Sam Matibini). The server-side session has already been invalidated (refresh-token rotation/expiry), but the browser still holds a stale local session. Supabase's default `signOut()` uses **global scope** — it calls the server, the server 403s, the JS client throws, and **local storage is never cleared**, so the UI stays "logged in" and clicking Log out appears to do nothing (logs show the same session id retried over and over).

`useAuth.signOut()` currently:
```ts
const signOut = async () => { await supabase.auth.signOut(); };
```
No error handling, no local fallback, no redirect.

## Fix

1. **`src/hooks/useAuth.tsx`** — make `signOut` resilient:
   - Try `supabase.auth.signOut({ scope: 'local' })` first (clears local tokens, no server round-trip required) — this is what fixes the stuck state.
   - Wrap in try/catch; on any error, force-clear by calling `setSession(null)` / `setUser(null)` and removing the `sb-*-auth-token` keys from `localStorage`.
   - After sign-out, `window.location.assign('/auth')` so the app fully resets (avoids stale React Query caches keyed by the old user).

2. **`src/pages/MorePage.tsx`** and **`src/components/layout/Header.tsx`** — keep using `signOut` from `useAuth`; no change needed beyond awaiting it (already does).

3. **`src/contexts/AdminAuthContext.tsx`** — apply the same `{ scope: 'local' }` + try/catch pattern in admin `signOut` so admins aren't stuck if their server session expires.

## Out of scope

- No changes to session lifetime, refresh-token rotation, or auth providers.
- No UI redesign of the More page or Header.

## Verification

- Reproduce: in preview, click **Log out** on `/more` — user should land on `/auth` and `useAuth().user` should be `null`.
- Auth logs should stop showing repeated 403s for the same session id.
- Admin portal: sign in at `/admin/login`, sign out — same clean behavior.
