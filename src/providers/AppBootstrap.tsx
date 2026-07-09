import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { prefetchAppSession } from "@/lib/appSession";
import { prefetchAllShellRouteChunks } from "@/lib/prefetchRoute";
import { prefetchGlobeLandData } from "@/lib/globeLandData";

interface AppSessionContextValue {
  isBootstrapped: boolean;
  userId: string | undefined;
}

const AppSessionContext = createContext<AppSessionContextValue>({
  isBootstrapped: false,
  userId: undefined,
});

export const useAppSession = () => useContext(AppSessionContext);

export const AppBootstrap = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setIsBootstrapped(false);
      return;
    }

    let cancelled = false;
    void prefetchGlobeLandData(true);
    prefetchAppSession(queryClient, user.id)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsBootstrapped(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, queryClient]);

  useEffect(() => {
    if (!user?.id || !isBootstrapped) return;

    const run = () => prefetchAllShellRouteChunks();
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(run, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 1500);
    return () => clearTimeout(timer);
  }, [user?.id, isBootstrapped]);

  return (
    <AppSessionContext.Provider value={{ isBootstrapped, userId: user?.id }}>
      {children}
    </AppSessionContext.Provider>
  );
};
