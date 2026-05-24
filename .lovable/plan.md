## Add Interac descriptive copy to Identity page

Update the Interac verification card on `/onboarding/identity` to include the official Interac description.

### Change

In `src/pages/onboarding/Identity.tsx`, replace the current short subtitle under the "Verify with Interac" heading:

> "Sign in with your Canadian bank to verify instantly."

with the official Interac copy:

> "Verify your identity quickly and securely with Interac® verification service using trusted data sources—all with the online banking login information you already use with a participating financial institution¹"

### Details

- Keep the existing card layout, green accent, and "Recommended in Canada" badge.
- Render the trailing `¹` as a small superscript footnote marker (no footnote text added unless you want one).
- No changes to `InteracVerification.tsx`, no logic changes.

Confirm and I'll switch to build mode to apply it. Want me to also add the actual footnote text (e.g. "¹ Subject to your financial institution's participation") below the card?