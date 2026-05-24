## Diagnosis

The current `src/pages/onboarding/Identity.tsx` already renders **both** options when the page first loads (no manual mode):

1. A Persona card — "Verify with Persona"
2. An **Interac card** — "Verify with Interac" (green, "Recommended in Canada"), rendered by `<InteracVerification />`

The screenshot you attached shows older copy ("Automated ID verification… bank-grade technology… Initializing…") that no longer exists anywhere in the codebase (`rg` finds zero matches). That screenshot is from a previous version of the page — most likely a **stale published build at `efin.money`** that was never re-published after the Persona+Interac dual-option refactor.

So nothing is missing in code — the live preview already shows the Interac button. The fix is just to make sure your view reflects the latest code.

## Plan

1. **Hard-refresh the preview** (`/onboarding/identity`) and confirm the green "Verify with Interac" card appears below the Persona card. If it does, the only remaining step is (2).
2. **Republish the app** so `https://efin.money` and `https://www.efin.money` pick up the new Identity page with the Interac option. (Frontend changes only go live after clicking Publish → Update.)
3. **If after a hard refresh the Interac card still doesn't appear in the preview**, I'll investigate further — possible causes would be a build error suppressing the second card (check console), or a route conflict. I'll inspect console logs and the rendered DOM at that point.

## Out of scope
No code changes are needed yet — Interac is already wired into `/onboarding/identity`. If step 3 surfaces a real bug, I'll plan the fix then.
