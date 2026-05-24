## Add "Save & Continue Later" to Onboarding

Let users pause KYC onboarding mid-flow when they don't have all documents ready, exit safely, and resume from where they left off on their next sign-in.

### UX

Add a secondary action in the onboarding footer on every step (Identity, Address, Liveness, Review):

```text
[ Save & exit ]        [ Continue → ]
```

- Clicking **Save & exit** opens a small confirmation dialog: "Your progress is saved. You can resume anytime from your dashboard."
- Two buttons: **Stay** / **Save & sign out** (and a third option: **Save & go to dashboard** if they want to stay logged in).
- On confirm: persist current field values + `current_step`, then redirect.

### Where it lives

Add a reusable `SaveAndExitButton` component rendered inside `OnboardingShell`'s footer area, so it appears consistently on:
- `/onboarding/identity`
- `/onboarding/address`
- `/onboarding/review` (and any liveness step)

`OnboardingShell` already accepts a `footer` prop — extend it with an optional `onSaveDraft` callback. Each page passes a function that writes its current local state to `profiles` / `kyc_verifications` (the same patches the pages already do on Continue).

### Resume behaviour

Already mostly works:
- `kyc_verifications.current_step` is updated on each step.
- Pages hydrate from `kyc` + `profiles` on mount.

Add:
- On login, if `kyc.status === 'in_progress'` (or any step < review), redirect from `/onboarding/welcome` (or dashboard CTA) to `kyc.current_step`.
- Add a "Resume verification" banner on the main dashboard when onboarding is incomplete, linking to the saved step.

### Technical details

Files to change:
- `src/components/kyc/OnboardingShell.tsx` — accept `onSaveDraft?: () => Promise<void>`; render `SaveAndExitButton` in header/footer.
- `src/components/kyc/SaveAndExitButton.tsx` (new) — button + AlertDialog; calls `onSaveDraft`, then either `supabase.auth.signOut()` + `navigate('/auth')` or `navigate('/')`.
- `src/pages/onboarding/Identity.tsx`, `Address.tsx`, `Review.tsx` — pass `onSaveDraft` that runs the same upsert logic already used (without requiring `canContinue`), and updates `kyc.current_step` to the current page's step name.
- `src/pages/Index.tsx` (or dashboard root) — show a "Resume identity verification" banner when `kyc.status !== 'approved'` and onboarding has started, linking to `kyc.current_step`.

No DB migration needed — `kyc_verifications.current_step` and partial profile fields are already nullable.

### Out of scope

- Email reminders to finish onboarding (can be added later).
- Auto-save of file uploads beyond what already happens (uploads already persist immediately).
