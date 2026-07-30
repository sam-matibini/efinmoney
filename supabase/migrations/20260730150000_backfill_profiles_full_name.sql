-- Backfill profiles.full_name for existing users where it was never
-- written. The original handle_new_user() trigger did not persist
-- full_name from raw_user_meta_data, so accounts created before
-- 20260730140000_handle_new_user_full_name.sql have NULL full_name even
-- though the signup form always collected a first + last name.
--
-- For these rows, derive a display name from the local part of the
-- user's email (e.g. "sam@efin.money" -> "Sam") so the admin users
-- list and user detail page never show the literal "No name".
--
-- We avoid touching non-null values so we never overwrite a real name
-- the user typed or an admin later edited. The derivation mirrors the
-- displayName() helper in src/pages/admin/UsersPage.tsx and
-- src/pages/admin/UserDetailPage.tsx so the UI is consistent.

UPDATE public.profiles
SET full_name = INITCAP(
  REPLACE(
    REPLACE(
      REPLACE(
        SPLIT_PART(COALESCE(email, ''), '@', 1),
        '.', ' '
      ),
      '_', ' '
    ),
    '-', ' '
  )
)
WHERE full_name IS NULL
  AND email IS NOT NULL
  AND SPLIT_PART(email, '@', 1) <> '';
