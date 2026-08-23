/**
 * Shared auth + helpers for Bambora edge functions.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function bamboraCustomerCode(userId: string): string {
  return `ef${userId.replace(/-/g, "").slice(0, 30)}`;
}

export async function requireUser(req: Request): Promise<
  | { user: { id: string; email?: string }; admin: SupabaseClient; profile: Record<string, unknown> | null }
  | { error: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: json(401, { error: "Unauthorized" }) };

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return { error: json(401, { error: "Unauthorized" }) };

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profile } = await admin.from("profiles")
    .select("user_id, email, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, admin, profile: profile as Record<string, unknown> | null };
}

export function supportedBamboraCurrency(currency: string): boolean {
  const c = currency.toUpperCase();
  return c === "CAD" || c === "USD";
}

export function validateTopupAmount(amount: number, currency: string): string | null {
  if (!Number.isFinite(amount)) return "Invalid amount";
  const min = currency === "USD" ? 1 : 1;
  const max = currency === "USD" ? 25_000 : 25_000;
  if (amount < min) return `Minimum amount is ${min.toFixed(2)} ${currency}`;
  if (amount > max) return "Amount exceeds safety limit";
  return null;
}
