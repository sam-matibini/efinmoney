-- Communication Hub send-broadcast edge function runs as service_role but
-- the originating migration (20260709120000_communication_hub.sql) only
-- granted table privileges to authenticated. service_role bypasses RLS yet
-- still needs the table-level GRANT, so the function's UPDATE on broadcasts,
-- UPSERT on broadcast_recipients, and INSERT on notifications all 42501.
--
-- Idempotent — same shape as the board_dashboard_view and customers fixes.

GRANT ALL ON public.broadcasts          TO service_role;
GRANT ALL ON public.broadcast_recipients TO service_role;
GRANT INSERT ON public.notifications     TO service_role;
