// Shared helpers for treasury edge functions
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: json({ error: "Unauthorized" }, 401) };
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { error: json({ error: "Unauthorized" }, 401) };
  return { user: data.user, sb };
}

export async function isStaff(sb: SupabaseClient, userId: string) {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  return roles.includes("admin") || roles.includes("finance");
}

export async function getTreasuryCapability(accountId?: string | null) {
  try {
    const accountsApi: any = stripe.accounts;
    const account = accountId ? await accountsApi.retrieve(accountId) : await accountsApi.retrieve();
    const status = account?.capabilities?.treasury ?? "inactive";

    return {
      accountId: account?.id ?? accountId ?? null,
      status,
      enabled: status === "active",
    };
  } catch (error) {
    console.error("treasury capability check failed", error);
    return {
      accountId: accountId ?? null,
      status: "unknown",
      enabled: false,
    };
  }
}
