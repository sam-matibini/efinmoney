## Goal

Wire up the two Interac OIDC endpoints the user just registered:

1. **JWKS URL** → `https://efin.money/oidc/jwks` (Interac fetches our public key here to verify the signed Request Object)
2. **Redirect URI** → `https://efin.money/callback` (where Interac sends the user after auth)

## Changes

### 1. Publish the public JWKS at `/oidc/jwks`

- Add a new edge function `supabase/functions/interac-jwks/index.ts` that reads `INTERAC_PRIVATE_JWK`, strips private fields (`d`, `p`, `q`, `dp`, `dq`, `qi`), wraps it as `{ "keys": [ <publicJwk> ] }`, and returns it with `Content-Type: application/json` and permissive CORS. Public endpoint, no auth.
- Mark it `verify_jwt = false` in `supabase/config.toml`.
- Add a SPA-level rewrite so `https://efin.money/oidc/jwks` proxies to the function. Lovable hosting honors `public/_redirects`, so add:
  ```
  /oidc/jwks  https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/interac-jwks  200
  ```
  (200 = rewrite, not redirect — Interac sees `efin.money/oidc/jwks` directly.)

### 2. Make `/callback` the redirect URI

- Update the runtime secret `INTERAC_REDIRECT_URI` to `https://efin.money/callback`.
- Add a rewrite in `public/_redirects` so the public callback URL proxies to the existing `interac-callback` edge function, preserving the `?code=…&state=…` query string:
  ```
  /callback  https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/interac-callback  200
  ```
- The existing `interac-callback` function already reads `code` + `state` from the URL and redirects the browser back to `/onboarding/identity?interac=success|error`, so no code change is needed there.
- `interac-start` already reads `INTERAC_REDIRECT_URI` and uses it both in the JAR claims and in the token-exchange call, so updating the secret is sufficient.

### 3. Deploy & verify

- Deploy `interac-jwks` and (re-)deploy `interac-start`.
- Smoke test:
  - `curl https://efin.money/oidc/jwks` → returns `{ "keys": [ { "kty": "RSA", "n": "...", "e": "AQAB", "alg": "PS256", "kid": "...", "use": "sig" } ] }` with no `d`.
  - Click "Verify with Interac" from `/onboarding/identity` → URL contains `?request=eyJ...`, Interac auth screen loads (no more `invalid_request`), completing it returns to `/onboarding/identity?interac=success`.

## Out of scope

- No DB schema changes.
- No changes to `interac-callback` logic — only the public URL in front of it changes.
- No frontend code changes — `/callback` is handled entirely by the hosting rewrite.

## Technical notes

- The `_redirects` file with `200` status is a proxy/rewrite, so the browser's URL bar stays on `efin.money/callback` and Interac's strict redirect-URI matching still passes.
- Stripping JWK private fields server-side (rather than checking in a public file) avoids any risk of leaking the private key if the secret format ever changes.
- If Lovable's hosting layer ever stops honoring `_redirects` for these paths, the fallback is to register the raw Supabase function URLs (`https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/...`) directly in the Interac portal instead.
