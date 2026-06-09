
# Sumsub KYC — Admin-Only Enhanced Due Diligence

Add Sumsub as an admin-triggered EDD tool that runs alongside Persona. Compliance officers launch a Sumsub check on any customer from `/admin/kyc`; results are stored and surfaced in the existing review UI. No user-facing onboarding changes.

## What gets built

### 1. Secrets (requested after plan approval)
- `SUMSUB_APP_TOKEN`
- `SUMSUB_SECRET_KEY`
- `SUMSUB_LEVEL_NAME` (the verification level configured in Sumsub dashboard)
- `SUMSUB_ENV` (`sandbox` or `production`)

### 2. Database (one migration)
New table `sumsub_verifications`:
- `user_id` (target customer)
- `applicant_id` (Sumsub ID)
- `level_name`, `review_status`, `review_answer` (GREEN/RED/YELLOW)
- `review_reject_type`, `moderation_comment`, `client_comment`
- `risk_labels` jsonb, `raw_payload` jsonb
- `requested_by_admin_id`, timestamps
- RLS: admins/compliance officers only; service role full access
- GRANTs to `authenticated` + `service_role`

New table `sumsub_webhook_logs` (raw events for audit) with admin read + service write.

### 3. Edge functions
- `sumsub-create-applicant` — admin-invoked. Creates Sumsub applicant for target user, stores applicant_id, returns a short-lived **WebSDK access token** scoped to that applicant + level. Admin-role check via `is_kyc_reviewer()`.
- `sumsub-refresh-token` — regenerates the access token when iframe expires.
- `sumsub-get-applicant-status` — pulls latest decision on demand and upserts to `sumsub_verifications`.
- `sumsub-webhook` (`verify_jwt = false`) — verifies HMAC-SHA256 signature against `SUMSUB_SECRET_KEY`, logs to `sumsub_webhook_logs`, updates `sumsub_verifications`, posts an admin notification on RED reviews.

### 4. Admin UI (`/admin/kyc/[userId]` review page)
- New "Enhanced Due Diligence (Sumsub)" card next to existing Persona block.
- Button: **Launch Sumsub Check** → calls `sumsub-create-applicant`, opens a modal embedding `@sumsub/websdk-react` with the returned token.
- Status panel: review answer (GREEN/RED/YELLOW), reject reasons, risk labels, last updated, link to Sumsub dashboard, **Refresh status** button.
- Risk labels render as chips next to existing Persona risk tags.

### 5. Integrations panel
- Flip Sumsub from "Disconnected" to "Connected" once `SUMSUB_APP_TOKEN` is present (read from secrets list).

## What is NOT built
- No user-facing `/onboarding/identity` change — Persona + Interac remain primary.
- No auto-trigger on signup; admin must launch each check.
- No replacement of in-house AML/PEP engine; Sumsub findings supplement it.

## Technical notes
- WebSDK loaded via `@sumsub/websdk-react` (browser-side only).
- Webhook signature: `X-Payload-Digest` + `X-Payload-Digest-Alg` headers, HMAC over raw body using `SUMSUB_SECRET_KEY`.
- All Sumsub REST calls signed with `X-App-Token` + `X-App-Access-Sig` + `X-App-Access-Ts` (HMAC-SHA256 of `ts+method+path+body`).
- Base URL: `https://api.sumsub.com` (prod) / sandbox uses same host with sandbox token.

## Files touched
- `supabase/functions/sumsub-create-applicant/index.ts` (new)
- `supabase/functions/sumsub-refresh-token/index.ts` (new)
- `supabase/functions/sumsub-get-applicant-status/index.ts` (new)
- `supabase/functions/sumsub-webhook/index.ts` (new)
- One migration: `sumsub_verifications`, `sumsub_webhook_logs`
- `src/pages/admin/KycReview.tsx` (or equivalent) — add Sumsub card + modal
- `src/components/admin/SumsubLaunchModal.tsx` (new)
- `src/pages/settings/Integrations.tsx` — flip status badge
- `package.json` — add `@sumsub/websdk-react`
- Memory file `mem://features/sumsub-edd` + index update
