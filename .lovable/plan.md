## Fix: "ui-portal.hub-verify.innovation.interac.ca refused to connect"

### Root cause
The Interac Hub Verify portal sets `X-Frame-Options: DENY`. In the Lovable preview the app runs inside an iframe, so `window.location.href = authorization_url` navigates the inner iframe to Interac, which the browser refuses to render. On the real domain (`efin.money`) there's no parent iframe, so this only shows up in preview — but the same code should handle both.

### Change
Update `src/components/kyc/InteracVerification.tsx` to do a top-level navigation when possible, with a popup fallback:

```ts
const url = data.authorization_url;
try {
  if (window.top && window.top !== window.self) {
    window.top.location.href = url;   // break out of Lovable preview iframe
  } else {
    window.location.href = url;        // production (efin.money)
  }
} catch {
  // Cross-origin iframe blocks window.top access → open new tab
  window.open(url, "_blank", "noopener");
}
```

No backend or other UI changes needed. After this, clicking "Verify with Interac" in the Lovable preview will load Interac's portal in the top window (or a new tab) instead of being blocked.

### Verification
1. Click "Verify with Interac" from `/onboarding/identity` in the preview.
2. Confirm browser navigates to `ui-portal.hub-verify.innovation.interac.ca` (or opens it in a new tab) instead of showing "refused to connect".