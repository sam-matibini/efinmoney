---
name: Sumsub Enhanced Due Diligence
description: Admin-only Sumsub WebSDK integration for enhanced KYC/AML alongside Persona
type: feature
---
Admin-triggered Sumsub check from /admin/kyc/[id]. Persona stays primary user-facing.

- Tables: `sumsub_verifications` (one per user+level), `sumsub_webhook_logs` (audit).
- Edge functions: `sumsub-create-applicant`, `sumsub-refresh-token`, `sumsub-get-applicant-status`, `sumsub-webhook` (verify_jwt=false, HMAC sig check).
- UI: `src/components/admin/SumsubCard.tsx` + `SumsubLaunchModal.tsx` using `@sumsub/websdk-react`.
- Secrets: `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_LEVEL_NAME`, `SUMSUB_ENV`.
- REST signing: HMAC-SHA256 of `ts+method+path+body` → `X-App-Access-Sig` header.
- Webhook signing: HMAC of raw body → `X-Payload-Digest` (alg in `X-Payload-Digest-Alg`).
- RED decisions create an `admin_notifications` row; no auto-freeze of the user.
- Access gated by `is_kyc_reviewer(uid)` (super_admin or compliance_officer).
