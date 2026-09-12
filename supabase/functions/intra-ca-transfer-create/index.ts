/**
 * Intra-Canada CAD pay-in: Plaid bank login + Loop Bank settlement destination.
 * Stripe ACSS / micro-deposits are intentionally NOT used — customers authorize
 * via Plaid Link (instant bank login), and funds are matched to Loop Autodeposit/EFT.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getLoopCadConfig } from "../_shared/loopCad.ts";
import {
  CAD_INTERAC_TRANSFER_SELECT,
  requireCadInteracDestination,
} from "../_shared/cadInteracPayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      plaid_account_id?: string;
      destination_wallet_id?: string;
      amount_cad?: number;
      description?: string;
      transfer_id?: string;
      purpose?: string;
    };

    const plaid_account_id = String(body.plaid_account_id || "");
    const destination_wallet_id = String(body.destination_wallet_id || "");
    const amount_cad = Number(body.amount_cad);
    const description = String(body.description || "").trim();
    const linkedTransferId = String(body.transfer_id || "").trim();
    const purpose = String(body.purpose || "topup").toLowerCase();

    if (!plaid_account_id || !destination_wallet_id || !Number.isFinite(amount_cad)) {
      return json({ error: "Missing fields" }, 400);
    }
    if (amount_cad <= 0 || amount_cad > 25000) {
      return json({ error: "Amount must be between 0.01 and 25,000 CAD" }, 400);
    }

    const { data: pa } = await supabase
      .from("plaid_accounts")
      .select("*")
      .eq("id", plaid_account_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pa) return json({ error: "Bank account not found" }, 404);

    const { data: wallet } = await supabase
      .from("wallets")
      .select("*")
      .eq("id", destination_wallet_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!wallet || String(wallet.currency_code).toUpperCase() !== "CAD") {
      return json({ error: "Destination must be a CAD wallet you own" }, 400);
    }

    if (purpose === "transfer" && linkedTransferId) {
      const { data: tr } = await supabase
        .from("transfers")
        .select(CAD_INTERAC_TRANSFER_SELECT)
        .eq("id", linkedTransferId)
        .maybeSingle();
      if (!tr || tr.sender_id !== user.id) {
        return json({ error: "Transfer not found" }, 404);
      }
      const gate = requireCadInteracDestination(tr);
      if (gate.required && !gate.ok) {
        return json({ error: gate.error, code: "missing_interac_contact" }, 400);
      }
    }

    const loop = getLoopCadConfig();
    const amount = Math.round(amount_cad * 100) / 100;

    // Reference used in Loop Autodeposit / EFT memo matching
    let reference = "";
    const { data: generated, error: refErr } = await supabase.rpc("next_interac_public_id");
    if (!refErr && typeof generated === "string" && generated) {
      reference = generated;
    } else {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      reference = `EFM-${day}-${String(Date.now() % 100000000).padStart(8, "0")}`;
    }

    const { data: transfer, error: tErr } = await supabase
      .from("intra_ca_transfers")
      .insert({
        user_id: user.id,
        plaid_account_id,
        destination_wallet_id,
        amount_cad: amount,
        description:
          description ||
          `Plaid→Loop CAD pay-in (${pa.name || "bank"} ••${pa.mask || ""})`,
        status: "processing",
        reference,
      })
      .select()
      .single();
    if (tErr) throw tErr;

    // Mirror into CAD Interac intents table so Support/ops can match Loop deposits.
    const senderName =
      String(user.user_metadata?.full_name || user.email || "Plaid customer").slice(0, 100);
    await supabase.from("fincra_cad_interac_intents").insert({
      user_id: user.id,
      wallet_id: destination_wallet_id,
      amount,
      currency_code: "CAD",
      reference,
      public_id: reference,
      status: "awaiting_payment",
      claimed_sent_at: new Date().toISOString(),
      sender_name: senderName,
      sender_email: user.email || null,
      sender_bank: pa.name || null,
      purpose: purpose === "transfer" ? "transfer" : purpose === "merchant_collection" ? "merchant_collection" : "topup",
      transfer_id: purpose === "transfer" && linkedTransferId ? linkedTransferId : null,
    }).then(({ error }) => {
      if (error) console.warn("intra-ca-transfer-create: interac intent insert", error.message);
    });

    // Do NOT credit the wallet here. Plaid Auth only links the bank — cash arrives
    // when the customer sends Interac/EFT to Loop and wise-webhook matches the intent.
    // Premature ledger credit caused payouts (execute-transfer) before Loop received funds.

    return json({
      success: true,
      provider: "loop",
      transfer_id: transfer.id,
      reference: transfer.reference || reference,
      status: "awaiting_payment",
      loop_alias: loop.alias,
      loop_eft: loop.eft,
      // Explicitly no Stripe micro-deposit / mandate URL
      hosted_mandate_url: null,
      stripe_status: null,
      message:
        "Bank linked via Plaid. Send Interac Autodeposit/EFT to Loop Bank with this reference; wallet credits and any linked payout release only after the deposit matches.",
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
