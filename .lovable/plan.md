# Switch Elicate integration to live/production

You selected **ELICATE_ENV switch** and **new live-only secrets**. The live base URL wasn't provided, so we'll also store it as a secret (`ELICATE_LIVE_BASE_URL`) — that way you can paste the production URL alongside the keys without another code edit, and we can flip back to sandbox by changing `ELICATE_ENV`.

## Secrets to add (via the secrets form)

- `ELICATE_ENV` — value `live` (or `sandbox` to revert)
- `ELICATE_LIVE_BASE_URL` — the production charge endpoint, e.g. `https://api.elicatepay.com/api/v1/payments/charge`
- `ELICATE_LIVE_SECRET_KEY`
- `ELICATE_LIVE_PUBLIC_KEY`
- `ELICATE_LIVE_WEBHOOK_SECRET`

Existing `ELICATE_SECRET_KEY` / `ELICATE_PUBLIC_KEY` / `ELICATE_WEBHOOK_SECRET` stay in place as the sandbox credentials — used when `ELICATE_ENV !== "live"`.

## Code changes (edge functions only)

Add a tiny shared helper inline in each function (or a new `supabase/functions/_shared/elicate.ts`) that resolves config based on `ELICATE_ENV`:

```ts
const isLive = (Deno.env.get("ELICATE_ENV") ?? "sandbox").toLowerCase() === "live";
const ELICATE_URL    = isLive
  ? (Deno.env.get("ELICATE_LIVE_BASE_URL") ?? "")
  : "https://elicatepay.vercel.app/api/v1/payments/charge";
const ELICATE_SECRET = isLive
  ? Deno.env.get("ELICATE_LIVE_SECRET_KEY")
  : Deno.env.get("ELICATE_SECRET_KEY");
const ELICATE_WEBHOOK_SECRET = isLive
  ? Deno.env.get("ELICATE_LIVE_WEBHOOK_SECRET")
  : Deno.env.get("ELICATE_WEBHOOK_SECRET");
```

Files to update:

1. **`supabase/functions/elicate-payout/index.ts`** — replace the current `ELICATE_URL` constant and `Deno.env.get("ELICATE_SECRET_KEY")` lookup with the helper. Log `mode: isLive ? "live" : "sandbox"` for debugging. Fail fast with a clear error when `isLive && !ELICATE_LIVE_BASE_URL`.
2. **`supabase/functions/elicate-webhook/index.ts`** — use the resolved `ELICATE_WEBHOOK_SECRET` for signature verification instead of reading `ELICATE_WEBHOOK_SECRET` directly.
3. **`supabase/functions/test-integrations/index.ts`** — in `checkElicate()`, read the resolved URL + key, and surface `mode` in the `details` payload so the System Diagnostics page shows whether live or sandbox is active.

No frontend, schema, or DB changes. No changes to webhook URLs on the Elicate dashboard — only the credentials they hold.

## Verification steps after deploy

1. Open `/admin/diagnostics` and confirm Elicate shows **Connected Successfully** with `mode: "live"`.
2. Run a small test payout to a controlled Zambian MoMo number through `/send` and confirm the Elicate dashboard logs it as live traffic and the webhook flips the transfer to `completed`.
3. If anything is wrong, set `ELICATE_ENV=sandbox` to instantly revert without redeploying.

## What I need from you

- The live base URL (paste it as the `ELICATE_LIVE_BASE_URL` secret value when the form pops up after you approve this plan).
- The three live keys (paste into the matching `ELICATE_LIVE_*` secret fields).
