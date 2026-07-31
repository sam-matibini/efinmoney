# eFinMoney Partner API

Read-only HTTP API for approved partners to query eFinMoney FX rates and corridor pricing.

**Base URL**

```
https://<your-efinmoney-backend>/functions/v1/partner-api
```

## Authentication

Every request must include your API key:

```
X-API-Key: efk_live_xxxxxxxxxxxxxxxx
```

Keys are issued by eFinMoney (Settings → Partner network → API partners) and are shown once at creation.
Keys can be scoped to `rates`, `corridors` and/or `quote`, and are rate limited per minute (default 60).

## Response envelope

```json
{ "success": true, "data": { }, "request_id": "..." }
```

Errors:

```json
{ "success": false, "code": "invalid_api_key", "error": "Invalid or revoked API key", "request_id": "..." }
```

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `missing_api_key` / `invalid_api_key` | No key, or key unknown/revoked |
| 403 | `partner_inactive` / `endpoint_forbidden` | Account suspended, or key not scoped for the endpoint |
| 404 | `not_found` / `rate_unavailable` | Unknown path, or no rate for the pair |
| 405 | `method_not_allowed` | Wrong HTTP method |
| 429 | `rate_limited` | Rate limit exceeded (see `Retry-After`) |
| 500 | `server_error` | Unexpected error |

## Endpoints

### `GET /v1/rates`

Query params: `base` (default `USD`), `symbols` (comma-separated allow-list).

```bash
curl -H "X-API-Key: $EFIN_KEY" \
  "$BASE/v1/rates?base=CAD&symbols=NGN,BWP,USD"
```

```json
{
  "success": true,
  "data": {
    "base": "CAD",
    "count": 3,
    "rates": [
      { "from": "CAD", "to": "NGN", "rate": 1123.44, "mid_rate": 1130.10, "derivation": "direct", "as_of": "2026-07-31T01:00:00Z" }
    ]
  }
}
```

`derivation` is `direct`, `inverse`, or `usd_cross` when the pair is derived through USD.

### `GET /v1/rates/{from}/{to}`

```bash
curl -H "X-API-Key: $EFIN_KEY" "$BASE/v1/rates/CAD/NGN"
```

Returns `rate`, `mid_rate`, `inverse_rate`, `derivation`, `as_of`.

### `GET /v1/corridors`

Supported corridors and their published rate-card pricing.
Optional filters: `source_currency`, `dest_currency`, `dest_country`.

```bash
curl -H "X-API-Key: $EFIN_KEY" "$BASE/v1/corridors?source_currency=CAD"
```

```json
{
  "success": true,
  "data": {
    "count": 12,
    "corridors": [
      {
        "direction": "payout",
        "source_currency": "CAD",
        "dest_currency": "NGN",
        "dest_country": "NG",
        "payment_method": "bank_transfer",
        "customer_type": "consumer",
        "pricing": { "fixed_fee": 2.99, "percentage_fee": 0.5, "min_fee": 2.99, "max_fee": null, "fx_margin_bps": 120 },
        "effective_from": "2026-01-01T00:00:00Z"
      }
    ]
  }
}
```

### `POST /v1/quote`

Indicative all-in price for an amount. No funds move.

```bash
curl -X POST -H "X-API-Key: $EFIN_KEY" -H "Content-Type: application/json" \
  -d '{"direction":"payout","source_currency":"CAD","dest_currency":"NGN","dest_country":"NG","payment_method":"bank_transfer","amount":500}' \
  "$BASE/v1/quote"
```

```json
{
  "success": true,
  "data": {
    "direction": "payout",
    "source_currency": "CAD",
    "dest_currency": "NGN",
    "amount": 500,
    "fee": 5.49,
    "fx_margin_bps": 120,
    "fx_revenue": 6.0,
    "total_cost": 505.49,
    "mid_rate": 1130.10,
    "customer_rate": 1116.54,
    "receive_amount": 552194.35,
    "pricing_missing": false,
    "indicative": true,
    "expires_at": "2026-07-31T02:01:00Z"
  }
}
```

Quotes are indicative and expire after 60 seconds. Fees always come from the central eFinMoney rate card — the same source used by the app itself.

## Notes

- All amounts are in the source currency unless stated otherwise.
- Every call is logged (endpoint, status, latency) for usage reporting.
- Keys are stored hashed; if a key is lost it must be revoked and re-issued.
