import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

const CRITICAL_PREFIXES = [
  "wallets",
  "dashboard-transfers",
  "fx_rates",
  "profile",
  "kyc",
];

export function useDashboardReady() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;

    function check() {
      const allDone = CRITICAL_PREFIXES.every((prefix) => {
        const state = queryClient.getQueryState([prefix, user.id]);
        if (!state) return false;
        if (state.fetchStatus === "fetching") return false;
        return state.status === "success";
      });
      if (allDone) setReady(true);
    }

    check();

    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      check();
    });

    return unsubscribe;
  }, [user, queryClient]);

  return ready;
}
