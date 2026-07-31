-- Board Compliance Dashboard view is created in 20260624003400 but the
-- migration never granted SELECT to the authenticated role, so the admin
-- Board Dashboard silently returned 42501 and rendered "No board data available".
-- Same omission that 20260730230000_grant_customers_finance_tables.sql fixed
-- for the underlying AR/CRM tables.
GRANT SELECT ON public.board_dashboard_view TO authenticated;
