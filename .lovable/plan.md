## Root cause

The Edge Function `scan-purchase-bill` deploys and boots correctly (a direct test returns `401 Unauthorized`, proving it runs). The error toast **"Failed to send a request to the Edge Function"** is thrown by the Supabase JS client at the **network/transport layer**, before the request reaches the function. Two things cause this in our current code:

1. **Payload too large.** We accept files up to 10 MB and send them as a base64 string inside JSON. Base64 inflates by ~33%, and after JSON stringify + headers the request frequently exceeds the gateway's request-body limit and is rejected at the edge with no JSON error body — which the JS client surfaces as the generic "Failed to send a request" message.
2. **No upstream visibility.** When `invoke()` fails at the transport layer, `error.message` is the generic string and `error.context` (the raw `Response`) is ignored, so we can't see the real status/body.

## Fix

Keep the change small and entirely in the scan path.

**1. Shrink the payload client-side (in `src/components/finance/PurchaseBillsPanel.tsx`):**
- For images (jpeg/png/webp/heic): downscale to max 1600 px on the long edge and re-encode as JPEG quality 0.8 via an offscreen `<canvas>` before base64. Typical receipt drops from 4–8 MB to ~300 KB.
- For PDFs: keep as-is but cap at **4 MB** (hard client limit) and show a clear toast if exceeded.
- Lower the overall pre-compression cap from 10 MB → 8 MB.

**2. Surface the real error:**
- After `invoke()`, if `error` is present, read `error.context` (a `Response`) and try `await error.context.json()` / `.text()` to extract the actual server message; fall back to the generic message.
- Log the resolved status + body to the console so we can diagnose any future failure quickly.

**3. Mirror the new limit on the server** (`supabase/functions/scan-purchase-bill/index.ts`): change the base64 size guard from ~14 MB to ~11 MB to match the new 8 MB raw cap with headroom, so the function rejects oversize input with a clean 400 instead of being killed at the gateway.

No DB, no UI restructure, no changes to the AI prompt or extraction logic.

## Verification

- Upload a typical phone photo of a receipt (3–6 MB JPEG) → request succeeds, form autofills.
- Upload an 8 MB PDF → succeeds.
- Upload a 12 MB file → clean client-side toast "File too large — max 8 MB", no network call.
- If the function returns a real error (e.g. 402 credits), the toast now shows the actual message instead of "Failed to send a request".
