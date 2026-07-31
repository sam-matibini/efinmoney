## Diagnosis (verified)

"Failed to send a request to the Edge Function" on **Save changes** is not a code bug in the dialog. I called the backend endpoint directly and it returned:

```text
404 NOT_FOUND — "Requested function was not found"
```

The `admin-update-user` function exists in the project source (`supabase/functions/admin-update-user/index.ts`, 206 lines, CORS + validation + audit logging all present) but has never been deployed to the backend, so the browser's invoke call fails before reaching any handler.

## Fix

1. Deploy `admin-update-user` to the backend.
2. Re-test the endpoint directly to confirm it now responds (expect an auth/method error instead of 404).
3. Verify the full path in the preview: open a user in the admin portal, edit a field, save, and confirm the success toast plus the new value in the change-history card.

## Technical notes

- No source changes are expected. If deployment surfaces a runtime import or type error, I'll fix it in that same file.
- The dialog's error toast currently shows the raw invoke message; after deployment real validation errors from the function (e.g. "Phone must be in international format") will surface properly.
