## Add Interac OIDC Document Verification (Production)

Integrate Interac's OpenID Connect (OIDC) client for ID verification as a **second option alongside Persona** on the onboarding Identity step. Canadian users will see both choices; the result feeds the same KYC approval pipeline.

### 1. Secrets (request after plan approval)

- `INTERAC_CLIENT_ID`
- `INTERAC_CLIENT_SECRET`
- `INTERAC_ISSUER_URL` (production OIDC discovery base, e.g. `https://oidc.interac.ca`)
- `INTERAC_REDIRECT_URI` (callback URL on our domain — we'll provide this for them to allowlist)
- `INTERAC_SCOPES` (e.g. `openid profile address document_verification`) — optional, defaults sensible

### 2. Database (migration)

Extend `kyc_verifications` with:
- `interac_session_id text` — our internal random state/nonce
- `interac_sub text` — Interac subject identifier returned in the ID token
- `interac_verification_status text` — `pending | approved | failed`
- `interac_claims jsonb` — verified claims (name, DOB, address, doc type/number, issuer)
- `interac_completed_at timestamptz`

Add `verification_provider text` ("persona" | "interac" | "manual") so admin review knows the source.

### 3. Edge functions

**`interac-start`** (verify JWT)
- Discovers OIDC config from `INTERAC_ISSUER_URL/.well-known/openid-configuration` (cached in-memory per cold start).
- Generates `state`, `nonce`, PKCE `code_verifier`/`code_challenge`.
- Stores them in `kyc_verifications` (`interac_session_id` = state, plus a short-lived row in a new `interac_sessions` table keyed by state holding `code_verifier`, `nonce`, `user_id`, `expires_at`).
- Returns `{ authorization_url }` built with `response_type=code`, scopes, redirect URI, state, nonce, PKCE.

**`interac-callback`** (public, `verify_jwt = false`)
- Receives `code` and `state` from Interac redirect.
- Looks up session row, validates not expired, deletes it (single-use).
- Exchanges code at token endpoint with `client_secret` + `code_verifier`.
- Validates ID token: signature against JWKS, `iss`, `aud == client_id`, `exp`, `nonce` match.
- Fetches `/userinfo` for verified document claims.
- Updates `kyc_verifications`: stores `interac_sub`, `interac_claims`, marks `id_verification_status = 'approved'`, `verification_provider = 'interac'`, and triggers the same downstream flow Persona uses (sets `verification_status` to `pending_review` or `approved` per existing logic in `on_kyc_status_change`).
- Redirects user back to `/onboarding/address` (or `/onboarding/pending` on failure with a query param).

### 4. Frontend

**`src/components/kyc/InteracVerification.tsx`** (mirrors `PersonaVerification.tsx`)
- Button "Verify with Interac". Calls `interac-start`, then `window.location.href = authorization_url`.
- Loading + error states identical to Persona component.

**`src/pages/onboarding/Identity.tsx`**
- Replace the single "Automated ID verification" card with a two-choice provider picker:
  - **Persona** (current) — left card
  - **Interac Document Verification** — right card, labeled "Recommended for Canadian residents"
- Keep "Continue with manual upload instead" link below both.
- After Interac redirect-back lands on `/onboarding/identity?interac=success` (or `error`), show a toast and advance the same way `onPersonaComplete` does.

### 5. Admin review

- `src/pages/admin/KycReviewPage.tsx` shows `verification_provider` badge and renders `interac_claims` JSON when the provider is Interac (no document images to view — Interac returns verified claims only).

### Technical notes

- OIDC client is built from scratch with `fetch` + `jose` (`npm:jose@5`) for JWT/JWKS validation. No SDK required.
- Discovery cached per-function-instance; JWKS fetched fresh per token validation (acceptable for KYC volume).
- `interac_sessions` rows expire after 10 minutes and are deleted on use; a cron-style cleanup is not required but a `DELETE WHERE expires_at < now()` runs at the top of `interac-callback`.
- All Interac claims stored in `interac_claims` jsonb so we can adapt to schema additions without further migrations.
- Memory: add `mem://features/interac-kyc` after build.

### Out of scope

- Replacing Persona (kept as a peer option).
- Per-country auto-routing (user picks).
- Storing or displaying any ID document images (Interac doesn't expose them).
