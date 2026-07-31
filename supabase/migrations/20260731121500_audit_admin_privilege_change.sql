-- Security Monitoring: write PRIVILEGE_CHANGE rows to audit_logs whenever an
-- admin's portal role changes. The security_events_view (created in
-- 20260624003600) filters audit_logs by action='PRIVILEGE_CHANGE' to power
-- the "Privilege Changes" card on /admin/security; until now nothing was
-- writing that action, so the card was permanently zero.
--
-- Fires on UPDATE only when role actually changes (status changes alone
-- don't count as a privilege change). Inserts run as SECURITY DEFINER so
-- audit_logs RLS doesn't gate the writer.

CREATE OR REPLACE FUNCTION public.audit_admin_privilege_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (
      NEW.id,
      'PRIVILEGE_CHANGE',
      'admin_users',
      NEW.id,
      jsonb_build_object('role', OLD.role, 'status', OLD.status),
      jsonb_build_object('role', NEW.role, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_admin_privilege_change ON public.admin_users;
CREATE TRIGGER trg_audit_admin_privilege_change
  AFTER UPDATE OF role ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_admin_privilege_change();
