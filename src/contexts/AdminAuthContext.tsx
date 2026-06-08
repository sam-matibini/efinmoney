import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { toast } from "sonner";

export type AdminRole = "super_admin" | "compliance_officer" | "support_agent" | "viewer";

export interface AdminRecord {
  id: string;
  role: AdminRole;
  full_name: string | null;
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
  | "edit_settings";

const ROLE_PERMISSIONS: Record<AdminRole, AdminAction[]> = {
  super_admin: [
    "view", "approve_kyc", "reject_kyc", "request_info", "escalate",
    "edit_internal_notes", "edit_users", "edit_tiers", "manage_admins", "edit_settings",
  ],
  compliance_officer: [
    "view", "approve_kyc", "reject_kyc", "request_info", "escalate",
    "edit_internal_notes", "edit_users",
  ],
  support_agent: ["view", "edit_internal_notes"],
  viewer: ["view"],
};

interface AdminAuthContextType {
  user: User | null;
  admin: AdminRecord | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasPermission: (action: AdminAction) => boolean;
  requirePermission: (action: AdminAction) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAdmin = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("admin_users")
      .select("id, role, full_name, permissions")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) {
      setAdmin(null);
      return null;
    }
    const rec: AdminRecord = {
      id: data.id,
      role: data.role as AdminRole,
      full_name: data.full_name,
      permissions: (data.permissions as Record<string, unknown>) || {},
    };
    setAdmin(rec);
    return rec;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('admin signOut error, forcing local clear', e);
    }
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    setAdmin(null);
    setUser(null);
  }, []);

  // Idle auto-logout
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!user) return;
    idleTimer.current = setTimeout(async () => {
      toast.warning("Session expired due to inactivity. Please sign in again.");
      await signOut();
    }, IDLE_TIMEOUT_MS);
  }, [user, signOut]);

  useEffect(() => {
    if (!user) return;
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const handler = () => resetIdle();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetIdle();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [user, resetIdle]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Defer to avoid deadlock on auth callback
        setTimeout(() => {
          fetchAdmin(session.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setAdmin(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchAdmin(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchAdmin]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const rec = await fetchAdmin(data.user!.id);
      if (!rec) {
        await supabase.auth.signOut();
        return { error: new Error("Access denied — this account is not registered as an administrator.") };
      }
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  };

  const hasPermission = useCallback((action: AdminAction) => {
    if (!admin) return false;
    return ROLE_PERMISSIONS[admin.role]?.includes(action) ?? false;
  }, [admin]);

  const requirePermission = useCallback((action: AdminAction) => {
    if (hasPermission(action)) return true;
    toast.error("Insufficient permissions for this action.");
    return false;
  }, [hasPermission]);

  return (
    <AdminAuthContext.Provider value={{ user, admin, loading, signIn, signOut, hasPermission, requirePermission }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
};
