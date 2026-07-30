import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

const CRITICAL_KEYS = [
  "wallets",
  "dashboard-transfers",
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
      const perUserDone = CRITICAL_KEYS.every((prefix) => {
        const state = queryClient.getQueryState([prefix, user.id]);
        if (!state) return false;
        if (state.fetchStatus === "fetching") return false;
        return state.status === "success";
      });
      // fx_rates is a global cache keyed without user.id
      const fxState = queryClient.getQueryState(["fx_rates"]);
      const fxDone =
        !!fxState &&
        fxState.fetchStatus !== "fetching" &&
        fxState.status === "success";
      if (perUserDone && fxDone) setReady(true);
    }

    check();

    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      check();
    });

    return unsubscribe;
  }, [user, queryClient]);

  return ready;
}
