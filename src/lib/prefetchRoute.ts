import { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const prefetched = new Set<string>();
const prefetchedChunks = new Set<string>();

/** Lazy route chunks still worth warming on hover / idle. */
const ROUTE_CHUNK_LOADERS: Record<string, () => Promise<unknown>> = {
  "/transfers": () => import("@/pages/TransfersListPage"),
  "/more": () => import("@/pages/MorePage"),
  "/send/cpn": () => import("@/pages/SendCpnPage"),
  "/send/african-card": () => import("@/pages/AfricanCardSendPage"),
  "/wallet/receive": () => import("@/pages/ReceivePage"),
  "/pay-bills": () => import("@/pages/PayBillsPage"),
  "/pay-bills/canada": () => import("@/pages/CanadaBillPayPage"),
  "/profile": () => import("@/pages/ProfileSettingsPage"),
  "/kyc": () => import("@/pages/KYCPage"),
  "/security": () => import("@/pages/SecurityPage"),
  "/finance": () => import("@/pages/FinanceDashboard"),
  "/operations": () => import("@/pages/OperationsDashboard"),
};

export function prefetchRouteChunk(href: string) {
  const path = href.split("?")[0];
  if (prefetchedChunks.has(path)) return;
  const loader = ROUTE_CHUNK_LOADERS[path];
  if (!loader) return;
  prefetchedChunks.add(path);
  void loader().catch(() => {
    prefetchedChunks.delete(path);
  });
}

export function prefetchAllShellRouteChunks() {
  Object.keys(ROUTE_CHUNK_LOADERS).forEach((href) => prefetchRouteChunk(href));
}

/** Warm React Query cache for a nav target before the user clicks. */
export function prefetchRoute(queryClient: QueryClient, href: string, userId?: string) {
  prefetchRouteChunk(href);
  if (!userId || prefetched.has(href)) return;
  prefetched.add(href);

  const warm = [
    queryClient.prefetchQuery({
      queryKey: ["profile", userId],
      queryFn: async () => {
        const { data } = await supabase
          .from("profiles")
          .select(
            "user_id, full_name, email, kyc_status, kyc_tier, default_currency, country_code, risk_score, account_number, efin_tag, kyc_framework_version",
          )
          .eq("user_id", userId)
          .maybeSingle();
        return data;
      },
      staleTime: 5 * 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: ["wallets", userId],
      queryFn: async () => {
        const { data } = await supabase.rpc("get_user_wallet_balances", { p_user_id: userId });
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    }),
  ];

  if (href === "/send" || href === "/" || href === "/dashboard") {
    warm.push(
      queryClient.prefetchQuery({
        queryKey: ["transfers", userId, 200],
        queryFn: async () => {
          const { data } = await supabase
            .from("transfers")
            .select("*")
            .eq("sender_id", userId)
            .order("created_at", { ascending: false })
            .limit(200);
          return data ?? [];
        },
        staleTime: 30_000,
      }),
    );
  }

  if (href === "/cards") {
    warm.push(
      queryClient.prefetchQuery({
        queryKey: ["cards", userId],
        queryFn: async () => {
          const { data } = await supabase.from("cards").select("*").eq("user_id", userId);
          return data ?? [];
        },
        staleTime: 30_000,
      }),
    );
  }

  void Promise.all(warm).catch(() => {
    prefetched.delete(href);
  });
}
