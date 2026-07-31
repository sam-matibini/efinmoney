# Partner API: corridor pricing & FX rates

Give external API partners a keyed, read-only HTTP API to fetch eFinMoney FX rates and corridor pricing, reusing the existing canonical rate card (`efinmoney_pricing` / `resolve_customer_price`) and `fx_rates` — no new pricing logic, no duplication.

## What partners get

Base URL: `https://<backend>/functions/v1/partner-api`, authenticated with `X-API-Key: efk_live_...`.

- `GET /v1/rates` — all currently-valid FX rates (mid + effective), optional `?base=USD&symbols=NGN,BWP,CAD`.
- `GET /v1/rates/{from}/{to}` — single pair with 24h change; falls back to USD cross derivation.
- `GET /v1/corridors` — supported corridors (source/dest currency, country, payment methods, enabled status).
- `POST /v1/quote` — body `{direction, source_currency, dest_currency, dest_country, payment_method, amount}` → fee, fx_margin_bps, fx_revenue, rate, total, expires_at. Indicative only (no funds move).

All responses JSON with `{ success, data, request_id }`; errors return `{ success:false, error, code }`.

## Backend work

1. **Migration** — new tables (with GRANTs, RLS on, admin-only policies via `has_role`):
   - `api_partners` (name, contact_email, status, tier, allowed_endpoints, created_by)
   - `api_partner_keys` (partner_id, key_hash SHA-256, key_prefix, label, last_used_at, revoked_at) — raw key shown once at creation only
   - `api_request_logs` (partner_id, endpoint, status_code, latency_ms, ip, created_at) for usage + rate limiting
   - RPC `verify_api_key(p_hash)` (security definer) returning partner id/status/tier
   - RPC `api_rate_limit_check(p_partner_id, p_limit, p_window_secs)` — DB-backed counter, same pattern as existing rate limiting.

2. **Edge function `partner-api`** (single function, path-suffix routing, `verify_jwt = false`):
   - `_shared/partnerAuth.ts`: hash header key, verify, check status + rate limit, return partner context or 401/429.
   - Rates handlers read `fx_rates` (same query shape as `market-rates`) and reuse `buildUsdRateMap` logic for cross pairs.
   - Quote handler calls `quotePrice` from `_shared/pricingService.ts` — zero new pricing math.
   - CORS headers on every response; log each request to `api_request_logs`.

3. **Admin UI** — new "API Partners" section inside `SettingsDashboard` (Partner Network area): list partners, create partner, issue/revoke keys (raw key shown once with copy button), and a usage table from `api_request_logs`.

4. **Docs** — `docs/PARTNER_API.md` with endpoints, auth, sample curl, error codes; linked from the admin panel.

## Technical notes

- Keys are stored hashed only (SHA-256 of `efk_live_<random>`); prefix stored for display.
- Rate limits by tier (e.g. 60 req/min standard) enforced in the DB, returning `429` with `Retry-After`.
- Quotes are indicative; a `quote_id` is logged so a later transfer can reference it.
- No service-role data is exposed — handlers select explicit columns only.
