import { corsHeaders, json, requireUser, admin, isStaff } from "../_shared/treasury.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user } = auth;

    const db = admin();
    const staff = await isStaff(db, user.id);

    const faQ = db.from("treasury_financial_accounts").select("*").order("created_at", { ascending: false });
    const tQ = db.from("treasury_transfers").select("*").order("created_at", { ascending: false }).limit(100);
    const rQ = db.from("treasury_received_entries").select("*").order("created_at", { ascending: false }).limit(100);

    const [{ data: fas }, { data: transfers }, { data: received }] = await Promise.all([
      staff ? faQ : faQ.eq("user_id", user.id),
      staff ? tQ : tQ.eq("user_id", user.id),
      staff ? rQ : rQ.eq("user_id", user.id),
    ]);

    return json({ financial_accounts: fas ?? [], transfers: transfers ?? [], received: received ?? [], staff });
  } catch (e: any) {
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
