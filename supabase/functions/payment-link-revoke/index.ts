// Sender revokes an unclaimed payment link: reverses the escrow journal and
// flips status to 'revoked'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getPendingClaimAccountId,
  getWalletLiabilityAccountId,
} from "../_shared/payment-link-ledger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "Not authenticated" }, 401);

  const body = await req.json().catch(() => ({}));
  const id: string | undefined = body?.id;
  const code: string | undefined = body?.code;
  if (!id && !code) return json({ error: "id or code required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const q = admin.from("payment_link_payouts").select("*");
  const { data: link } = id ? await q.eq("id", id).maybeSingle() : await q.eq("short_code", code!).maybeSingle();
  if (!link) return json({ error: "Not found" }, 404);
  if (link.sender_id !== u.user.id) return json({ error: "Not your link" }, 403);
  if (link.status !== "pending") return json({ error: `Link is ${link.status}` }, 409);

  // Reverse escrow: CR wallet liability / DR 2199
  const walletLiabId = await getWalletLiabilityAccountId(admin, link.currency);
  const pendingLiabId = await getPendingClaimAccountId(admin, link.currency);
  if (!walletLiabId || !pendingLiabId) return json({ error: "Missing ledger accounts" }, 500);

  const reversalJournalId = crypto.randomUUID();
  await admin.from("ledger_entries").insert([
    {
      journal_id: reversalJournalId, account_id: pendingLiabId, wallet_id: null,
      currency_code: link.currency, debit_amount: link.amount, credit_amount: 0,
      description: `Payment Link revoke [${link.short_code}]`, reference_type: "payment_link", reference_id: link.short_code, created_by: u.user.id,
    },
    {
      journal_id: reversalJournalId, account_id: walletLiabId, wallet_id: link.sender_wallet_id,
      currency_code: link.currency, debit_amount: 0, credit_amount: link.amount,
      description: `Payment Link revoke [${link.short_code}]`, reference_type: "payment_link", reference_id: link.short_code, created_by: u.user.id,
    },
  ]);

  await admin.from("payment_link_payouts").update({ status: "revoked", reversal_journal_id: reversalJournalId }).eq("id", link.id);
  return json({ success: true });
});
