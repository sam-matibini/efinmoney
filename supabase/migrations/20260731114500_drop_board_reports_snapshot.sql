-- Drop dead code introduced in 20260624003400.
-- The board dashboard reads from board_dashboard_view (live), so the
-- monthly board_reports table and snapshot_board_metrics() function are
-- unused: nothing scheduled the function, no page reads the table.
-- The view itself is unchanged and continues to back the Board Dashboard.
DROP TABLE IF EXISTS public.board_reports;
DROP FUNCTION IF EXISTS public.snapshot_board_metrics(date);
