import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAID_ENV = (Deno.env.get("PLAID_ENV") || "sandbox").trim();
const PLAID_BASE = `https://${PLAID_ENV}.plaid.com`;

async function plaid(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${PLAID_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("PLAID_CLIENT_ID"),
      secret: Deno.env.get("PLAID_SECRET"),
      ...body,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_message || `Plaid ${path} failed`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { public_token, institution } = await req.json();
    if (!public_token) return new Response(JSON.stringify({ error: "public_token required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const exch = await plaid("/item/public_token/exchange", { public_token });
    const accountsRes = await plaid("/accounts/get", { access_token: exch.access_token });
    let auth_numbers: any = { eft: [] };
    try {
      const a = await plaid("/auth/get", { access_token: exch.access_token });
      auth_numbers = a.numbers || { eft: [] };
    } catch (e) {
      console.warn("auth/get failed (some sandbox institutions don't support auth):", e);
    }

    const { data: itemRow, error: itemErr } = await supabase.from("plaid_items").insert({
      user_id: user.id,
      item_id: exch.item_id,
      access_token: exch.access_token,
      institution_id: institution?.institution_id ?? null,
      institution_name: institution?.name ?? null,
    }).select().single();
    if (itemErr) throw itemErr;

    const accountsToInsert = (accountsRes.accounts || []).map((acc: any) => {
      const eft = (auth_numbers.eft || []).find((e: any) => e.account_id === acc.account_id);
      return {
        user_id: user.id,
        item_id: itemRow.id,
        plaid_account_id: acc.account_id,
        name: acc.name,
        official_name: acc.official_name,
        mask: acc.mask,
        subtype: acc.subtype,
        type: acc.type,
        institution_number: eft?.institution ?? null,
        branch_number: eft?.branch ?? null,
        account_number: eft?.account ?? null,
        currency_code: acc.balances?.iso_currency_code || "CAD",
      };
    });
    if (accountsToInsert.length) {
      const { error: aErr } = await supabase.from("plaid_accounts").insert(accountsToInsert);
      if (aErr) throw aErr;
    }

    return new Response(JSON.stringify({ success: true, item_id: itemRow.id, accounts: accountsToInsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
