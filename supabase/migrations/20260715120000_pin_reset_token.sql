-- Add token columns to profiles for the Resend-based PIN reset flow.
-- The edge function (pin-reset-request) stores a time-limited token here;
-- pin-reset-confirm validates it via the service-role key and clears the PIN.

alter table public.profiles
  add column if not exists pin_reset_token       text,
  add column if not exists pin_reset_expires_at  timestamptz;
