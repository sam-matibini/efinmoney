## Wire up the new Interac Hub OIDC registration

The portal gave us a fresh Hub registration. We need a new signing key, the JWKS published at the documented URL, a clean callback route, and updated secrets.

### 1. Generate a new RSA PS256 signing keypair

I'll generate a brand-new 2048-bit RSA keypair locally during build:
- Public JWK → written to `public/.well-known/jwks.json` so it's served at `https://hub.efin.money/.well-known/jwks.json` (matches the portal's JWKS URL exactly).
- Private JWK → stored in a new secret `INTERAC_HUB_PRIVATE_JWK` (kept separate from the existing `INTERAC_PRIVATE_JWK` so the older registration keeps working until you cut over).
- Both will share a fresh `kid` so Interac can pick the right key from the JWKS.

```text
public/.well-known/jwks.json   ← committed to repo, served by Lovable hosting
INTERAC_HUB_PRIVATE_JWK        ← new runtime secret (you paste / I generate)
```

### 2. Add /interac/callback route on hub.efin.money

New file: `src/pages/InteracHubCallback.tsx`
- Reads `?code=...&state=...&error=...` from the URL.
- POSTs them to the `interac-exchange` edge function.
- Shows a small "Verifying with Interac..." spinner, then navigates to `/onboarding/identity?interac=success` (or `?interac=error&reason=...`).

Add the route to `src/App.tsx`: `<Route path="/interac/callback" element={<InteracHubCallback />} />`.

This way the Interac portal can send the user to `https://hub.efin.money/interac/callback` and the SPA handles the exchange via the existing edge function. No new edge function is needed — `interac-exchange` already accepts `{ code, state }`.

### 3. Update edge functions to use the new credentials

Both `interac-start` and `interac-exchange` currently read:
- `INTERAC_ISSUER_URL`
- `INTERAC_CLIENT_ID`
- `INTERAC_CLIENT_SECRET`
- `INTERAC_REDIRECT_URI`
- `INTERAC_SCOPES`
- `INTERAC_PRIVATE_JWK`

Change `interac-start` to **prefer the new Hub secrets** when present (with fallback to the legacy names so nothing breaks if you roll back):

```ts
const ISSUER       = env("INTERAC_HUB_ISSUER_URL")     ?? env("INTERAC_ISSUER_URL");
const CLIENT_ID    = env("INTERAC_HUB_CLIENT_ID")      ?? env("INTERAC_CLIENT_ID");
const REDIRECT_URI = env("INTERAC_HUB_REDIRECT_URI")   ?? env("INTERAC_REDIRECT_URI");
const SCOPES       = env("INTERAC_HUB_SCOPES")         ?? env("INTERAC_SCOPES");
const PRIVATE_JWK  = env("INTERAC_HUB_PRIVATE_JWK")    ?? env("INTERAC_PRIVATE_JWK");
```

Same change in `interac-exchange` (for issuer/client_id/client_secret/redirect_uri).

The Hub registration on the portal uses **public client + client authentication via signed Request Object (JAR)**, so there is no `client_secret` to send to the token endpoint. If the token exchange currently sends `client_secret`, I'll switch it to use `private_key_jwt` client assertion signed with the same private JWK when the new secrets are configured. (I'll inspect the actual auth method Interac documents in the portal docs once we know which method they require — they sometimes accept the secret too.)

### 4. Secrets I'll request via `add_secret`

After approval I'll prompt you for:
- `INTERAC_HUB_ISSUER_URL` = `https://gateway-portal.hub-verify.innovation.interac.ca/`
- `INTERAC_HUB_CLIENT_ID` = `15d2a3ea-946a-42e1-9178-3631491ea16c`
- `INTERAC_HUB_REDIRECT_URI` = `https://hub.efin.money/interac/callback`
- `INTERAC_HUB_SCOPES` = `openid general_scope`
- `INTERAC_HUB_PRIVATE_JWK` = the private JWK I generate (I'll paste the JSON into the secret form when it opens)
- `INTERAC_HUB_CLIENT_SECRET` = leave blank if the registration doesn't use one (most Hub setups don't)

You'll just need to click "Save" — the values will be pre-filled where possible.

### 5. Update the Interac portal once deployed

After we ship:
- Change **Redirect URL** in the Hub portal from `https://hub.efin.money` to `https://hub.efin.money/interac/callback`.
- Confirm the JWKS URL `https://hub.efin.money/.well-known/jwks.json` returns the new JWK (I'll curl-check it).

### Out of scope

- Removing the legacy `INTERAC_PRIVATE_JWK` / `public/oidc/jwks` route — left in place as a fallback until you confirm the Hub flow works end-to-end. Easy to delete in a follow-up.
- Updating the React onboarding UI strings — no copy changes needed; the existing `?interac=success|error` handling stays.

### Verification steps after build

1. `curl https://hub.efin.money/.well-known/jwks.json` → returns the new JWK with `alg: PS256`.
2. From `/onboarding/identity`, click "Start Interac verification" → redirects to Hub portal → completes → lands on `/interac/callback` → exchanges → arrives at `/onboarding/identity?interac=success`.
3. `interac-exchange` edge function logs show successful ID-token verification against the Hub issuer.
