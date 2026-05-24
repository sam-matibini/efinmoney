## Goal

Fix the `invalid_request — Request parameter 'request' is required` error returned by Interac Hub Verify. Interac enforces **JAR (RFC 9101)** — authorization parameters must be wrapped in a signed JWT (`request=<JWT>`) instead of plain query params.

## Changes

### 1. `supabase/functions/interac-start/index.ts`

- Import `SignJWT` and `importJWK` from `jose` (`npm:jose@5`).
- Load `INTERAC_PRIVATE_JWK` (just added) and parse it as a JWK. Use its `alg` (default `PS256`) and `kid`.
- After generating `state`, `nonce`, `codeVerifier`, `codeChallenge`, build a JWT with claims:
  - `iss` = `CLIENT_ID`
  - `aud` = OIDC `issuer` from discovery
  - `response_type` = `"code"`
  - `client_id` = `CLIENT_ID`
  - `redirect_uri` = `REDIRECT_URI`
  - `scope` = `SCOPES`
  - `state`, `nonce`, `code_challenge`, `code_challenge_method = "S256"`
  - `iat` = now, `exp` = now + 5 min, `jti` = random
- Sign it (`alg` from JWK, `kid` in header, `typ: "oauth-authz-req+jwt"`).
- Build the redirect URL as `${authorization_endpoint}?client_id=...&response_type=code&scope=...&request=<JWT>` (Interac still wants `client_id`, `response_type`, `scope` outside the JWT per spec).
- Keep DB session insert and KYC update unchanged.
- On `INTERAC_PRIVATE_JWK` missing, return a clear 500 error.

### 2. Deploy + test

- Deploy `interac-start`.
- Trigger the flow from `/onboarding/identity` → click "Verify with Interac".
- Confirm the URL now contains `?request=eyJ...` and Interac shows the authentication screen instead of `invalid_request`.
- If Interac instead errors with `invalid_request_object` / signature failure, the public JWK isn't registered yet — surface that to the user so they can paste it into the Interac portal.

## No code changes outside the edge function

Frontend, DB schema, and callback function (`interac-callback`) all stay the same — the callback already validates `state` and exchanges the code; that flow is unaffected by JAR.

## Technical notes

- `jose@5` works natively in Deno via `npm:jose@5`.
- `typ: "oauth-authz-req+jwt"` is the RFC 9101 media type; Interac's deployment accepts it (and falls back to `JWT`).
- Algorithm is taken from the JWK's `alg` field, so switching between `RS256` and `PS256` only requires re-uploading a new JWK — no code change.
