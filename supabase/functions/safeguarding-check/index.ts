import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SafeguardingSnapshot {
  snapshot_date: string;
  currency_code: string;
  customer_wallet_liability: number;
  ledger_trust_balance: number;
  bank_trust_balance: number | null;
  surplus_deficit: number;
  status: "ok" | "variance" | "breach";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth: accept the internal secret (scheduled runs) OR an admin/finance/compliance JWT.
    const internalSecret = req.headers.get("x-internal-secret");
    let authorized = false;

    if (internalSecret && internalSecret === serviceKey) {
      authorized = true;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
        if (userData.user) {
          const { data: roles } = await admin
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id)
            .in("role", ["admin", "finance", "compliance"]);
          authorized = !!roles && roles.length > 0;
        }
      }
    }

    if (!authorized) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Compute + persist today's three-way snapshot per currency.
    const { data: snapshots, error: rpcErr } = await admin.rpc("compute_safeguarding_snapshot");
    if (rpcErr) {
      console.error("compute_safeguarding_snapshot failed:", rpcErr);
      return json({ error: "Failed to compute snapshot", detail: rpcErr.message }, 500);
    }

    const rows = (snapshots ?? []) as SafeguardingSnapshot[];
    const breaches = rows.filter((r) => r.status === "breach");

    let notified = 0;
    if (breaches.length > 0) {
      // Fan out one notification per breached currency to each compliance role-holder,
      // skipping any already raised today (idempotent across re-runs).
      const { data: roleHolders } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "finance", "compliance"]);
      const adminIds = [...new Set((roleHolders ?? []).map((r) => r.user_id as string))];

      const today = breaches[0].snapshot_date;
      const { data: existing } = await admin
        .from("admin_notifications")
        .select("admin_id, payload")
        .eq("type", "safeguarding_breach")
        .gte("created_at", `${today}T00:00:00Z`);

      const alreadySent = new Set(
        (existing ?? []).map((n) => `${n.admin_id}:${(n.payload as Record<string, unknown>)?.currency_code}`),
      );

      const toInsert: Array<Record<string, unknown>> = [];
      for (const breach of breaches) {
        for (const adminId of adminIds) {
          if (alreadySent.has(`${adminId}:${breach.currency_code}`)) continue;
          toInsert.push({
            admin_id: adminId,
            type: "safeguarding_breach",
            payload: {
              snapshot_date: breach.snapshot_date,
              currency_code: breach.currency_code,
              customer_wallet_liability: breach.customer_wallet_liability,
              ledger_trust_balance: breach.ledger_trust_balance,
              bank_trust_balance: breach.bank_trust_balance,
              surplus_deficit: breach.surplus_deficit,
              message: `Safeguarding breach: ${breach.currency_code} trust balance is below customer funds by ${Math.abs(breach.surplus_deficit)}.`,
            },
          });
        }
      }

      if (toInsert.length > 0) {
        const { error: notifyErr } = await admin.from("admin_notifications").insert(toInsert);
        if (notifyErr) console.error("Failed to insert breach notifications:", notifyErr);
        else notified = toInsert.length;
      }
    }

    return json({
      success: true,
      snapshot_date: rows[0]?.snapshot_date ?? null,
      currencies: rows.length,
      breaches: breaches.length,
      notified,
      snapshots: rows,
    });
  } catch (e) {
    console.error("safeguarding-check error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
