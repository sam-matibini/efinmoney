# Fix the eFinMoney recipient dropdown returning nothing

The dropdown opens but always says "No eFinMoney user found", so it is neither browsable nor scrollable in practice.

## Diagnosis (to confirm as step 1)

`list_efin_recipients` (and the older `search_efin_recipients`) are declared `STABLE`, but they call `check_rate_limit`, which performs `DELETE`/`INSERT`/`UPDATE` on `rate_limits`. Postgres rejects data modification inside a non-volatile function, so the RPC most likely raises an error, the frontend query fails, the list stays empty, and the UI falls through to the "No eFinMoney user found" branch. The frontend currently swallows that error, which is why no message is shown.

First step is to call the RPC as an authenticated user and read the actual error before changing anything.

## Fix

1. Migration: recreate `list_efin_recipients` (and `search_efin_recipients`, which shares the flaw) as `VOLATILE SECURITY DEFINER` so the rate-limit bookkeeping is allowed. Keep the same signature, masking, self-exclusion, ordering, paging, and `authenticated`-only execute grant.
2. If the confirmed error is something else (for example a grant or a column issue), fix that instead and keep the rest of this plan.

## Frontend (`src/components/send/EfinRecipientQuickPick.tsx`)

- Surface RPC failures: when the directory query errors, show the error text in the dropdown with a Retry action instead of the misleading "No eFinMoney user found".
- Keep "No eFinMoney user found" only for a genuinely empty successful result.
- No change to typing, scrolling, paging, keyboard navigation, or selection logic.

## Verification

- Query the RPC directly and confirm it returns rows for an empty query and for a partial name.
- Load `/send?mode=efinmoney` in the browser, open the field, and confirm a scrollable member list appears and filters as you type.
