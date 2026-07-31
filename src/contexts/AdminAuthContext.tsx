import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export type AdminRole =
  | "super_admin"
  | "compliance_officer"
  | "finance_officer"
  | "support_agent"
  | "viewer";

export type AdminStatus = "invited" | "pending_review" | "active" | "rejected" | "suspended";

export interface AdminRecord {
  id: string;
  role: AdminRole;
  status: AdminStatus;
  full_name: string | null;
  email: string | null;
  department: string | null;
  departmentPermissions: AdminAction[];
  permissions: Record<string, unknown>;
}

type AdminAction =
  | "view"
  | "approve_kyc"
  | "reject_kyc"
  | "request_info"
  | "escalate"
  | "edit_internal_notes"
  | "edit_users"
  | "edit_tiers"
  | "manage_admins"
  | "manage_staff"
  | "manage_finance"
  | "edit_settings";

const ROLE_PERMISSIONS: Record<AdminRole, AdminAction[]> = {
  super_admin: [
    "view", "approve_kyc", "reject_kyc", "request_info", "escalate",
    "edit_internal_notes", "edit_users", "edit_tiers", "manage_admins",
    "manage_staff", "manage_finance", "edit_settings",
  ],
  compliance_officer: [
    "view", "approve_kyc", "reject_kyc", "request_info", "escalate",
    "edit_internal_notes", "edit_users", "edit_tiers",
  ],
  finance_officer: [
    "view", "manage_finance",
  ],
  support_agent: ["view", "edit_internal_notes"],
  viewer: ["view"],
};

interface AdminAuthContextType {
  admin: AdminRecord | null;
  loading: boolean;
  signOut: () => Promise<void>;
  hasPermission: (action: AdminAction) => boolean;
  requirePermission: (action: AdminAction) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Thin wrapper around the shared `useAuth()` that adds admin-only concerns:
 *   * loading the admin_users record for the signed-in user
 *   * role + department permission checks
 *   * admin-side 30-minute idle auto-logout
 *
 * Sign-in / sign-out / lockout all flow through the shared `useAuth` so
 * there is exactly one Supabase auth subscription for the whole app.
 */
export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const { user, signOut: sharedSignOut } = useAuth();
  const [admin, setAdmin] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset loading whenever the user identity changes (sign-in or sign-out).
  useEffect(() => {
    setLoading(true);
  }, [user?.id]);

  // Fetch the admin record whenever the signed-in user changes.
  useEffect(() => {
    if (!user) {
      setAdmin(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, role, status, full_name, email, department, permissions")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("AdminAuth: error fetching admin record", error);
        setAdmin(null);
        setLoading(false);
        return;
      }
      if (!data) {
        // Signed in but not an admin — leave admin=null. AdminGuard handles redirect.
        setAdmin(null);
        setLoading(false);
        return;
      }

      let departmentPermissions: AdminAction[] = [];
      if (data.department) {
        const { data: dept } = await (supabase as any)
          .from("departments")
          .select("permissions")
          .eq("name", data.department)
          .maybeSingle();
        if (dept?.permissions && Array.isArray(dept.permissions)) {
          departmentPermissions = dept.permissions.filter(
            (p): p is AdminAction => typeof p === "string"
          );
        }
      }

      const rec: AdminRecord = {
        id: data.id,
        role: data.role as AdminRole,
        status: (data.status as AdminStatus) ?? "active",
        full_name: data.full_name,
        email: (data as { email?: string | null }).email ?? null,
        department: (data as { department?: string | null }).department ?? null,
        departmentPermissions,
        permissions: (data.permissions as Record<string, unknown>) || {},
      };
      setAdmin(rec);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const signOut = useCallback(async () => {
    await sharedSignOut();
    setAdmin(null);
  }, [sharedSignOut]);

  // Idle auto-logout — only while a confirmed admin is signed in.
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!admin) return;
    idleTimer.current = setTimeout(async () => {
      toast.warning("Session expired due to inactivity. Please sign in again.");
      await signOut();
    }, IDLE_TIMEOUT_MS);
  }, [admin, signOut]);

  useEffect(() => {
    if (!admin) return;
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const handler = () => resetIdle();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetIdle();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [admin, resetIdle]);

  const hasPermission = useCallback((action: AdminAction) => {
    if (!admin || admin.status !== "active") return false;
    if (ROLE_PERMISSIONS[admin.role]?.includes(action)) return true;
    if (admin.departmentPermissions?.includes(action)) return true;
    return false;
  }, [admin]);

  const requirePermission = useCallback((action: AdminAction) => {
    if (hasPermission(action)) return true;
    toast.error("Insufficient permissions for this action.");
    return false;
  }, [hasPermission]);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, signOut, hasPermission, requirePermission }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
};
