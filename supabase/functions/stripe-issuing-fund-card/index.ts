import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Move funds from a user wallet into the "card float" via double-entry ledger.
// Dr. Customer wallet liability  /  Cr. Card-Float liability (sub-account per card)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimData, error: claimErr } = await supabase.auth.getClaims(token);
    if (claimErr || !claimData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimData.claims.sub as string;

    const { card_id, wallet_id, amount } = await req.json();
    const amt = Number(amount);
    if (!card_id || !wallet_id || !(amt > 0)) return json({ error: "Invalid input" }, 400);

    const { data: card } = await admin.from("issued_cards").select("*").eq("id", card_id).maybeSingle();
    if (!card || card.user_id !== userId) return json({ error: "Card not found" }, 404);
    if (card.status !== "active") return json({ error: `Card is ${card.status}` }, 400);

    const { data: wallet } = await admin.from("wallets").select("*").eq("id", wallet_id).maybeSingle();
    if (!wallet || wallet.user_id !== userId) return json({ error: "Wallet not found" }, 404);
    if (wallet.currency_code !== card.currency) {
      return json({ error: `Wallet currency ${wallet.currency_code} does not match card ${card.currency}` }, 400);
    }

    // Check balance
    const { data: balData } = await admin.rpc("get_wallet_balance", { p_wallet_id: wallet_id });
    const bal = Number(balData || 0);
    if (bal < amt) return json({ error: "Insufficient wallet balance" }, 400);

    // Resolve ledger accounts
    const { data: fromAcct } = await admin
      .from("ledger_accounts")
      .select("id")
      .like("code", "21%")
      .eq("currency_code", card.currency)
      .limit(1)
      .maybeSingle();
    const { data: floatAcct } = await admin
      .from("ledger_accounts")
      .select("id")
      .like("code", "22%")
      .eq("currency_code", card.currency)
      .limit(1)
      .maybeSingle();

    const journalId = crypto.randomUUID();

    // Debit user wallet liability
    const entries = [
      {
        journal_id: journalId,
        account_id: fromAcct?.id || null,
        wallet_id,
        currency_code: card.currency,
        debit_amount: amt,
        credit_amount: 0,
        description: `Card funding: ${card.last4 || card.id}`,
        reference_type: "card_funding",
        reference_id: card.id,
        created_by: userId,
      },
      {
        journal_id: journalId,
        account_id: floatAcct?.id || fromAcct?.id || null,
        wallet_id: null,
        currency_code: card.currency,
        debit_amount: 0,
        credit_amount: amt,
        description: `Card float: ${card.last4 || card.id}`,
        reference_type: "card_funding",
        reference_id: card.id,
        created_by: userId,
      },
    ];

    const { error: ledgerErr } = await admin.from("ledger_entries").insert(entries);
    if (ledgerErr) throw ledgerErr;

    await admin.from("card_funding_events").insert({
      card_id,
      user_id: userId,
      source: "wallet",
      source_wallet_id: wallet_id,
      amount: amt,
      currency: card.currency,
      ledger_journal_id: journalId,
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    return json({ ok: true, journal_id: journalId });
  } catch (e: any) {
    console.error("fund-card error:", e);
    return json({ error: e?.message || "Failed" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
