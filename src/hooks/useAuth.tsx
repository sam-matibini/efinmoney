import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { identifyUser, resetAnalytics, track } from '@/lib/analytics';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  timedOut: boolean;
  retry: () => void;
  signUp: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    accountType?: string,
    address?: {
      street: string;
      city: string;
      state: string;
      postalCode: string;
      countryCode: string;
      phone?: string;
      dateOfBirth?: string;
      occupation?: string;
      nationality?: string;
    }
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string, p_kind?: "admin" | "customer") => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkLockout: (email: string, p_kind?: "admin" | "customer") => Promise<{ locked: boolean; lockedUntil: string | null; remainingSeconds: number }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Best-effort account-activity log for the CRM timeline — never blocks auth. */
const logAccountActivity = (userId: string, eventType: string, description: string) => {
  void supabase
    .from('account_activity')
    .insert({
      user_id: userId,
      event_type: eventType,
      description,
      actor_type: 'user',
      actor_id: userId,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
    })
    .then(({ error }) => {
      if (error) console.warn('activity log failed:', error.message);
    });
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let settled = false;
    // Clear the loading gate exactly once, no matter which path resolves first.
    const stopLoading = () => { if (!settled) { settled = true; setLoading(false); } };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        stopLoading();
        if (session?.user) {
          identifyUser(session.user.id, { email: session.user.email });
          if (event === 'SIGNED_IN') {
            logAccountActivity(session.user.id, 'signed_in', 'Signed in');
          }
        } else if (event === 'SIGNED_OUT') {
          resetAnalytics();
        }
      }
    );


    // THEN check for existing session. Guard against a rejected/hanging
    // getSession() (e.g. a stale token) trapping the app on the spinner.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch((e) => console.warn('getSession failed', e))
      .finally(stopLoading);

    // Safety net: never leave the user stuck on the loading spinner if auth
    // initialization stalls for any reason. If we hit the timeout without
    // resolution, surface that as `timedOut` so consumers can offer a retry
    // instead of silently dropping the user on a blank page.
    const timeout = window.setTimeout(() => {
      if (!settled) setTimedOut(true);
      stopLoading();
    }, 8000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  const retry = () => {
    setTimedOut(false);
    setLoading(true);
    window.location.reload();
  };

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    accountType?: string,
    address?: {
      street: string;
      city: string;
      state: string;
      postalCode: string;
      countryCode: string;
      phone?: string;
      dateOfBirth?: string;
      occupation?: string;
      nationality?: string;
    }
  ) => {
    const fullName = `${firstName} ${lastName}`.trim();
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
            // Country is consumed by handle_new_user() to seed the right
            // default wallet (e.g. NGN for a Nigerian signup) before the
            // client-side profile update fires.
            country: address?.countryCode ?? null,
            // Drives the post-confirmation route (KYB for business, KYC for individual).
            account_type: accountType === "business" ? "business" : "individual",
          },
        },
      });

      if (error) throw error;

      // Update profile with full name + address + identity fields after signup
      if (!error) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          track('user_signed_up', { email });
          const profileUpdate: Record<string, string | null> = { full_name: fullName };
          if (address) {
            profileUpdate.street_address = address.street || null;
            profileUpdate.city = address.city || null;
            profileUpdate.state_province = address.state || null;
            profileUpdate.postal_code = address.postalCode || null;
            profileUpdate.address_country = address.countryCode || null;
            if (address.phone)        profileUpdate.phone_number = address.phone;
            if (address.dateOfBirth)  profileUpdate.date_of_birth = address.dateOfBirth;
            if (address.occupation)   profileUpdate.occupation = address.occupation;
            if (address.nationality)   profileUpdate.nationality = address.nationality;
          }
          await supabase
            .from('profiles')
            .update(profileUpdate)
            .eq('user_id', user.id);

          // Fetch profile (account_number is generated by DB trigger).
          // Retry briefly in case the trigger hasn't completed yet.
          let accountNumber: string | null = null;
          let efinTag: string | null = null;
          for (let i = 0; i < 5; i++) {
            const { data: p } = await supabase
              .from('profiles')
              .select('account_number, efin_tag')
              .eq('user_id', user.id)
              .maybeSingle();
            if (p?.account_number) {
              accountNumber = p.account_number as string;
              efinTag = (p.efin_tag as string | null) ?? null;
              break;
            }
            await new Promise((r) => setTimeout(r, 400));
          }

          // Fire-and-forget welcome email with account number + @efin tag invite
          supabase.functions.invoke('send-email', {
            body: {
              type: 'welcome',
              to: email,
              data: {
                name: fullName,
                account_number: accountNumber,
                efin_tag: efinTag,
                app_url: window.location.origin,
              },
            },
          }).catch((e) => console.warn('welcome email failed', e));
        }
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string, p_kind: "admin" | "customer" = "customer") => {
    try {
      // 1. Check for an active lockout before sending the password.
      const lockout = await (supabase as any).rpc("check_login_lockout", { p_email: email, p_kind });
      const lockoutData = (lockout as any)?.data;
      if (lockoutData?.locked) {
        const mins = Math.max(1, Math.ceil((lockoutData.remaining_seconds ?? 0) / 60));
        return {
          error: new Error(
            `Too many failed sign-in attempts. This account is locked. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`
          ),
        };
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // 2. Successful sign-in: clear any lockout for this email + kind.
      try {
        await (supabase as any).rpc("clear_login_lockout", { p_email: email, p_kind });
      } catch { /* best effort */ }
      return { error: null };
    } catch (e) {
      // 3. Log the failure and surface remaining-attempts / lockout info.
      try {
        const { data: failData } = await (supabase as any).rpc("log_login_failure", { p_email: email, p_kind });
        if (failData?.locked) {
          const mins = Math.max(1, Math.ceil((failData.remaining_seconds ?? 0) / 60));
          const lockHours = p_kind === "admin" ? 2 : 1;
          return {
            error: new Error(
              `Too many failed sign-in attempts. This account is now locked for ${lockHours} hour${lockHours === 1 ? "" : "s"}. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`
            ),
          };
        }
        if (typeof failData?.remaining_attempts === "number" && failData.remaining_attempts > 0) {
          return {
            error: new Error(
              `Incorrect email or password. ${failData.remaining_attempts} attempt${failData.remaining_attempts === 1 ? "" : "s"} left before your account is locked.`
            ),
          };
        }
      } catch (rpcErr) {
        console.warn("[Auth] log_login_failure RPC failed:", rpcErr);
      }
      return { error: e as Error };
    }
  };

  const checkLockout = async (email: string, p_kind: "admin" | "customer" = "customer") => {
    try {
      const { data } = await (supabase as any).rpc("check_login_lockout", { p_email: email, p_kind });
      if (data?.locked) {
        return {
          locked: true,
          lockedUntil: data.locked_until as string | null,
          remainingSeconds: (data.remaining_seconds as number) ?? 0,
        };
      }
    } catch { /* ignore */ }
    return { locked: false, lockedUntil: null, remainingSeconds: 0 };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('signOut error', e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, timedOut, retry, signUp, signIn, signOut, checkLockout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
