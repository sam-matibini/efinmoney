-- The Contact form (contact-message) and the notification functions
-- (notify-staff, notify-guest-reply) run as service_role and insert/read
-- support_threads + support_messages. Those tables were granted only to
-- `authenticated` (see 20260709130000_support_inbox.sql), so service_role writes
-- failed with 42501 insufficient_privilege — surfaced by the contact-message
-- end-to-end test returning {code:"42501", at:"thread"}. Grant the backend role
-- explicitly, matching how the KYB tables grant ALL to service_role.
GRANT ALL ON public.support_threads TO service_role;
GRANT ALL ON public.support_messages TO service_role;
