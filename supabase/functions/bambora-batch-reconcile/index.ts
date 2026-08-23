/**
 * Credit wallets for settled Bambora EFT debits (staff / cron).
 * Marks submitted collections as credited after manual or future report sync.
 * Body: { collectionId?, markSettled? } + x-internal-secret or admin JWT
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaBambora } from "../_shared/bambora-credit.ts";
import { corsHeaders, json } from "../_shared/bambora-auth.ts";

async function isStaff(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const secret = req.headers.get("x-internal-secret");
  if (secret && secret === Deno.env.get("INTERNAL_SECRET")) return true;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return false;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  return (roles ?? []).some((r) => ["admin", "compliance", "ops"].includes(String(r.role)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (!(await isStaff(req, admin))) return json(403, { error: "Forbidden" });

    const body = await req.json().catch(() => ({}));
    const collectionId = body.collectionId ? String(body.collectionId) : "";
    const markSettled = body.markSettled !== false;

    let query = admin.from("bambora_eft_collections")
      .select("*")
      .in("status", markSettled ? ["submitted", "processing", "settled"] : ["settled"]);

    if (collectionId) query = query.eq("id", collectionId);

    const { data: rows, error } = await query.limit(50);
    if (error) throw new Error(error.message);

    const results: Array<Record<string, unknown>> = [];
    for (const row of rows ?? []) {
      if (row.status === "credited") {
        results.push({ id: row.id, skipped: true, reason: "already_credited" });
        continue;
      }
      if (markSettled && row.status === "submitted") {
        await admin.from("bambora_eft_collections")
          .update({ status: "settled", settled_at: new Date().toISOString() })
          .eq("id", row.id);
      }

      const ref = String(row.external_reference);
      const { already } = await creditWalletViaBambora(
        admin,
        row.user_id,
        String(row.currency_code),
        Number(row.amount),
        ref,
        row.wallet_id,
        `Wallet top-up via Bambora EFT (${row.batch_id || row.id})`,
      );

      await admin.from("bambora_eft_collections")
        .update({ status: "credited", credited_at: new Date().toISOString() })
        .eq("id", row.id);

      results.push({ id: row.id, credited: !already, already, amount: row.amount });
    }

    return json(200, { success: true, processed: results.length, results });
  } catch (err) {
    console.error("bambora-batch-reconcile", err);
    return json(500, { error: err instanceof Error ? err.message : "Reconcile failed" });
  }
});
