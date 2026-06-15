## Goal
Restore the preview by removing the infinite loading state on `/` without undoing the recent security hardening.

## Plan
1. Add a new database migration to restore authenticated read access for the safe, non-sensitive columns the client still needs from `public.kyc_verifications` and `public.transfers`.
2. Keep sensitive fields protected by using column-level grants rather than broad table access.
3. Update the KYC route gate so backend permission/query failures do not trap the app on a full-screen spinner when the user profile already indicates the newer KYC framework.
4. Validate in the preview that `/` renders again and that the loading overlay clears.

## Technical details
- Root cause: `KYCGuard` waits on `useKyc()`, but `kyc_verifications` is now returning `403 permission denied`, so `isLoading` never resolves into a usable route decision and the app appears blank.
- Evidence gathered:
  - Session replay shows the splash screen disappears, then the app remains on a centered loading spinner.
  - Network requests show `kyc_verifications` returns `403` while `profiles` and `user_risk_tiers` return `200`.
  - The recent security migration revoked authenticated `SELECT` on `kyc_verifications`/`transfers`, causing a regression for existing client queries.
- Fix shape:
  - Database: restore least-privilege read grants needed by the current hooks.
  - Frontend: make the guard resilient so a permission error cannot block the whole app shell forever.

## Validation
- Home route renders instead of a blank spinner.
- No blocking `permission denied for table kyc_verifications` failure in the critical route gate path.
- Existing sensitive KYC/transfer fields remain inaccessible to normal users.