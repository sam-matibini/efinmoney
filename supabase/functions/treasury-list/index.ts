import { corsHeaders, json, requireUser, admin, isStaff, getTreasuryCapability } from "../_shared/treasury.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const db = admin();
    const staff = await isStaff(db, user.id);
    const { data: ownConnectedAccount } = await db
      .from("stripe_connected_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const ownConnectedAccountId = ownConnectedAccount?.stripe_account_id ?? null;

    const faQ = db.from("treasury_financial_accounts").select("*").order("created_at", { ascending: false });
    const tQ = db.from("treasury_transfers").select("*").order("created_at", { ascending: false }).limit(100);
    const rQ = db.from("treasury_received_entries").select("*").order("created_at", { ascending: false }).limit(100);

    const [{ data: fas }, { data: transfers }, { data: received }, platformTreasury, userTreasury] = await Promise.all([
      staff ? faQ : faQ.eq("user_id", user.id),
      staff ? tQ : tQ.eq("user_id", user.id),
      staff ? rQ : rQ.eq("user_id", user.id),
      staff ? getTreasuryCapability(null) : Promise.resolve(null),
      ownConnectedAccountId
        ? getTreasuryCapability(ownConnectedAccountId)
        : Promise.resolve({ accountId: null, status: "missing_connected_account", enabled: false }),
    ]);

    return json({
      financial_accounts: fas ?? [],
      transfers: transfers ?? [],
      received: received ?? [],
      staff,
      capabilities: {
        platform_treasury: platformTreasury,
        user_treasury: userTreasury,
      },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
