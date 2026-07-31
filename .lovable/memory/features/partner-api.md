---
name: Partner API
description: Keyed read-only HTTP API (partner-api edge function) for external partners to query FX rates, corridors and price quotes
type: feature
---
External partners call `/functions/v1/partner-api` with an `X-API-Key: efk_live_...` header.

Endpoints: `GET /v1/rates` (base+symbols), `GET /v1/rates/{from}/{to}`, `GET /v1/corridors`, `POST /v1/quote`.

- Keys stored hashed (SHA-256) in `api_partner_keys`; raw key shown once at issue time via the `api-partner-key-create` edge function (admin only).
- `api_partners` holds status, tier, `rate_limit_per_min` (enforced with the existing `check_rate_limit` RPC) and `allowed_endpoints` scopes (`rates`/`corridors`/`quote`).
- Every call logged to `api_request_logs`.
- Pricing always comes from `quotePrice` (`efinmoney_pricing` rate card) — never recomputed. Rates come from `fx_rates` with USD-cross derivation.
- Admin UI: Settings → Partner network → **API partners**. Docs: `docs/PARTNER_API.md`.
