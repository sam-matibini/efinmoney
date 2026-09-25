import { useCallback, useEffect, useState } from "react";

const KEY = "efm-hide-balance";
const EVENT = "efm-hide-balance-change";

function readHidden() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

/** Shared show/hide for wallet balances. The dashboard and wallets page stay in step. */
export function useHideBalance() {
  const [hidden, setHiddenState] = useState(readHidden);

  useEffect(() => {
    const sync = () => setHiddenState(readHidden());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setHidden = useCallback((next: boolean | ((value: boolean) => boolean)) => {
    setHiddenState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      localStorage.setItem(KEY, value ? "1" : "0");
      window.dispatchEvent(new Event(EVENT));
      return value;
    });
  }, []);

  return [hidden, setHidden] as const;
}
