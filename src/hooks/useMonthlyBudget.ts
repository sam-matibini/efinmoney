import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MonthlyBudget {
  amount: number;
  currency: string;
}

function readBudget(meta: Record<string, unknown> | undefined): MonthlyBudget | null {
  const raw = meta?.monthly_budget as { amount?: unknown; currency?: unknown } | undefined;
  const amount = Number(raw?.amount);
  if (!raw || !Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: typeof raw.currency === "string" ? raw.currency : "CAD" };
}

/** Per-user monthly spending budget, stored in Supabase auth user_metadata (no schema change). */
export function useMonthlyBudget() {
  const { user } = useAuth();
  const [override, setOverride] = useState<MonthlyBudget | null | undefined>(undefined);
  const budget = override !== undefined ? override : readBudget(user?.user_metadata);

  const saveBudget = useCallback(async (amount: number, currency = "CAD") => {
    const next = { amount: Math.round(amount * 100) / 100, currency };
    const { error } = await supabase.auth.updateUser({ data: { monthly_budget: next } });
    if (error) throw error;
    setOverride(next);
    return next;
  }, []);

  return { budget, saveBudget };
}
