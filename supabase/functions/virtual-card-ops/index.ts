import { createClient } from "npm:@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { decryptSecret, encryptSecret, generateCvv, generatePan } from "../_shared/card-secrets.ts";

type Sb = ReturnType<typeof createClient>;

function formatDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const details = typeof err === "object" && err && "details" in err
    ? String((err as { details?: string }).details || "")
    : "";
  const full = `${msg} ${details}`.trim();

  if (/permission denied for table card_secrets/i.test(full)) {
    return "Edge function cannot write to card_secrets. Run: GRANT ALL ON public.card_secrets TO service_role;";
  }
  if (/permission denied for table virtual_card_transfers/i.test(full)) {
    return "Edge function cannot write to virtual_card_transfers. Run: GRANT ALL ON public.virtual_card_transfers TO service_role;";
  }
  if (/card_secrets/i.test(full) && /does not exist|schema cache|Could not find/i.test(full)) {
    return "Virtual card secrets storage is not set up. In Supabase SQL Editor, run production-sql.sql sections 5–6.";
  }
  if (/virtual_card_transfers/i.test(full) && /does not exist|schema cache|Could not find/i.test(full)) {
    return "Virtual card transfers table is missing. Run production-sql.sql section 5.";
  }
  if (/Could not find the .*column.*cards/i.test(full) || /column.*(balance|currency_code).*does not exist/i.test(full)) {
    return "Cards table is missing balance/currency columns. Run production-sql.sql section 5.";
  }
  if (/null value in column "account_id"/i.test(full)) {
    return "Ledger is missing a wallet liability account for this currency. Ensure account 2101 (CAD) exists in ledger_accounts.";
  }
  return full || msg;
}

async function walletLiabilityAccountId(admin: Sb, currency: string): Promise<string | null> {
  const { data } = await admin.from("ledger_accounts").select("id")
    .eq("account_type", "liability")
    .eq("currency_code", currency)
    .like("code", "21%")
    .order("code", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "create") return await createCard(admin, userId, body);
    if (action === "reveal") return await revealSecrets(supabase, admin, userId, body);
    if (action === "store_secrets") return await storeSecrets(supabase, admin, userId, body);
    if (action === "fund") return await fundFromWallet(admin, userId, body);
    if (action === "transfer") return await transferBetweenCards(admin, userId, body);

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("virtual-card-ops error:", err);
    return jsonResponse({ error: formatDbError(err) }, 500);
  }
});

async function verifyUserPin(supabase: Sb, pin: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9]{4}$/.test(pin)) return { ok: false, error: "PIN must be 4 digits" };
  const { data, error } = await supabase.rpc("verify_transaction_pin", { p_pin: pin });
  if (error) return { ok: false, error: error.message };
  const res = (data ?? {}) as { ok?: boolean; locked?: boolean; no_pin?: boolean };
  if (res.no_pin) return { ok: false, error: "Set up your transaction PIN in Security settings first" };
  if (res.locked) return { ok: false, error: "PIN locked — try again later" };
  if (!res.ok) return { ok: false, error: "Incorrect PIN" };
  return { ok: true };
}

async function createCard(admin: Sb, userId: string, body: Record<string, unknown>) {
  try {
    return await createCardInner(admin, userId, body);
  } catch (err) {
    console.error("createCard error:", err);
    return jsonResponse({ error: formatDbError(err) }, 500);
  }
}

async function createCardInner(admin: Sb, userId: string, body: Record<string, unknown>) {
  const cardType = String(body.card_type || "virtual");
  const network = String(body.card_network || "visa") === "mastercard" ? "mastercard" : "visa";
  const cardholderName = String(body.cardholder_name || "").trim();
  const walletId = String(body.wallet_id || "");
  const currency = body.currency_code ? String(body.currency_code) : null;
  const spendingLimit = Number(body.spending_limit) || 5000;
  const creditLimit = body.credit_limit != null ? Number(body.credit_limit) : null;
  const isCredit = cardType === "credit";
  const initialFund = Number(body.initial_fund) || 0;

  if (!cardholderName) return jsonResponse({ error: "Cardholder name is required" }, 400);
  if (!isCredit && !walletId) return jsonResponse({ error: "Linked wallet is required" }, 400);

  const pan = generatePan(network);
  const cvv = generateCvv();
  const lastFour = pan.slice(-4);
  const now = new Date();
  const expYear = now.getFullYear() + 4;
  const expMonth = now.getMonth() + 1;

  const { data: card, error: insertErr } = await admin.from("cards").insert({
    user_id: userId,
    card_type: cardType,
    card_network: network,
    cardholder_name: cardholderName,
    last_four: lastFour,
    expiry_month: expMonth,
    expiry_year: expYear,
    spending_limit: spendingLimit,
    credit_limit: isCredit ? creditLimit : null,
    funding_source: isCredit ? "credit_line" : "wallet",
    wallet_id: isCredit ? null : walletId,
    currency_code: currency,
  }).select("*").single();
  if (insertErr) throw insertErr;

  const panEnc = await encryptSecret(pan);
  const cvvEnc = await encryptSecret(cvv);
  const { error: secErr } = await admin.from("card_secrets").insert({
    card_id: card.id,
    pan_encrypted: panEnc,
    cvv_encrypted: cvvEnc,
  });
  if (secErr) {
    await admin.from("cards").delete().eq("id", card.id);
    throw secErr;
  }

  let balance = 0;
  if (!isCredit && walletId && initialFund > 0) {
    try {
      const fundRes = await fundFromWallet(admin, userId, {
        card_id: card.id,
        wallet_id: walletId,
        amount: initialFund,
      });
      if (fundRes.status !== 200) {
        const errBody = await fundRes.json();
        return jsonResponse({
          ok: true,
          card: { ...card, balance: 0 },
          pan,
          cvv,
          secrets_stored: true,
          warning: errBody.error || "Card created but initial funding failed — fund it manually from the Cards page.",
        });
      }
      const fundJson = await fundRes.json();
      balance = Number(fundJson.card_balance ?? initialFund);
    } catch (fundErr) {
      console.error("createCard funding error:", fundErr);
      return jsonResponse({
        ok: true,
        card: { ...card, balance: 0 },
        pan,
        cvv,
        secrets_stored: true,
        warning: `Card created but initial funding failed: ${formatDbError(fundErr)}`,
      });
    }
  }

  return jsonResponse({
    ok: true,
    card: { ...card, balance },
    pan,
    cvv,
    secrets_stored: true,
  });
}

async function storeSecrets(supabase: Sb, admin: Sb, userId: string, body: Record<string, unknown>) {
  const cardId = String(body.card_id || "");
  const pin = String(body.pin || "");
  const pan = String(body.pan || "").replace(/\s/g, "");
  const cvv = String(body.cvv || "");
  if (!cardId || !pan || !cvv) return jsonResponse({ error: "Missing card_id, pan, or cvv" }, 400);

  const pinCheck = await verifyUserPin(supabase, pin);
  if (!pinCheck.ok) return jsonResponse({ error: pinCheck.error }, 403);

  const { data: card } = await admin.from("cards").select("id, user_id, funding_source, last_four").eq("id", cardId).maybeSingle();
  if (!card || card.user_id !== userId) return jsonResponse({ error: "Card not found" }, 404);
  if (card.funding_source === "external") return jsonResponse({ error: "Cannot store secrets for linked cards" }, 400);
  if (pan.slice(-4) !== card.last_four) return jsonResponse({ error: "Card number does not match" }, 400);

  const { data: existing } = await admin.from("card_secrets").select("card_id").eq("card_id", cardId).maybeSingle();
  if (existing) return jsonResponse({ error: "Secrets already stored for this card" }, 409);

  const { error } = await admin.from("card_secrets").insert({
    card_id: cardId,
    pan_encrypted: await encryptSecret(pan),
    cvv_encrypted: await encryptSecret(cvv),
  });
  if (error) throw error;
  return jsonResponse({ ok: true });
}

async function revealSecrets(supabase: Sb, admin: Sb, userId: string, body: Record<string, unknown>) {
  const cardId = String(body.card_id || "");
  const pin = String(body.pin || "");
  if (!cardId || !pin) return jsonResponse({ error: "card_id and pin are required" }, 400);

  const pinCheck = await verifyUserPin(supabase, pin);
  if (!pinCheck.ok) return jsonResponse({ error: pinCheck.error }, 403);

  const { data: card } = await admin.from("cards").select("*").eq("id", cardId).maybeSingle();
  if (!card || card.user_id !== userId) return jsonResponse({ error: "Card not found" }, 404);
  if (card.funding_source === "external") return jsonResponse({ error: "Linked cards cannot be revealed here" }, 400);

  const { data: secrets } = await admin.from("card_secrets").select("pan_encrypted, cvv_encrypted").eq("card_id", cardId).maybeSingle();
  if (!secrets) {
    return jsonResponse({
      error: "Full card details are not on file for this card. Create a new virtual card to enable PIN-protected reveal.",
      has_secrets: false,
    }, 404);
  }

  const pan = await decryptSecret(secrets.pan_encrypted);
  const cvv = await decryptSecret(secrets.cvv_encrypted);
  return jsonResponse({
    ok: true,
    pan,
    cvv,
    last_four: card.last_four,
    expiry_month: card.expiry_month,
    expiry_year: card.expiry_year,
    cardholder_name: card.cardholder_name,
    card_network: card.card_network,
  });
}

async function fundFromWallet(admin: Sb, userId: string, body: Record<string, unknown>) {
  const cardId = String(body.card_id || "");
  const walletId = String(body.wallet_id || "");
  const amt = Number(body.amount);
  if (!cardId || !walletId || !(amt > 0)) return jsonResponse({ error: "Invalid input" }, 400);

  const { data: card } = await admin.from("cards").select("*").eq("id", cardId).maybeSingle();
  if (!card || card.user_id !== userId) return jsonResponse({ error: "Card not found" }, 404);
  if (card.status !== "active") return jsonResponse({ error: `Card is ${card.status}` }, 400);
  if (card.funding_source === "external") return jsonResponse({ error: "Cannot fund linked external cards" }, 400);

  const { data: wallet } = await admin.from("wallets").select("*").eq("id", walletId).maybeSingle();
  if (!wallet || wallet.user_id !== userId) return jsonResponse({ error: "Wallet not found" }, 404);

  const currency = card.currency_code || wallet.currency_code;
  if (wallet.currency_code !== currency) {
    return jsonResponse({ error: `Wallet ${wallet.currency_code} does not match card currency ${currency}` }, 400);
  }

  const { data: balData } = await admin.rpc("get_wallet_balance", { p_wallet_id: walletId });
  const walletBal = Number(balData || 0);
  if (walletBal < amt) return jsonResponse({ error: "Insufficient wallet balance" }, 400);

  const fromAcctId = await walletLiabilityAccountId(admin, currency);
  if (!fromAcctId) {
    return jsonResponse({
      error: `No wallet liability ledger account for ${currency}. Ensure ledger account 2101 (CAD) or equivalent exists.`,
    }, 400);
  }
  const { data: floatAcct } = await admin.from("ledger_accounts").select("id")
    .eq("code", "2200").maybeSingle();
  const floatAcctId = floatAcct?.id || fromAcctId;

  const journalId = crypto.randomUUID();
  const { error: ledgerErr } = await admin.from("ledger_entries").insert([
    {
      journal_id: journalId,
      account_id: fromAcctId,
      wallet_id: walletId,
      currency_code: currency,
      debit_amount: amt,
      credit_amount: 0,
      description: `Virtual card funding •••• ${card.last_four}`,
      reference_type: "virtual_card_funding",
      reference_id: cardId,
      created_by: userId,
    },
    {
      journal_id: journalId,
      account_id: floatAcctId,
      wallet_id: null,
      currency_code: currency,
      debit_amount: 0,
      credit_amount: amt,
      description: `Virtual card float •••• ${card.last_four}`,
      reference_type: "virtual_card_funding",
      reference_id: cardId,
      created_by: userId,
    },
  ]);
  if (ledgerErr) {
    console.error("fundFromWallet ledger error:", ledgerErr);
    return jsonResponse({ error: formatDbError(ledgerErr) }, 400);
  }

  const newBalance = Number(card.balance || 0) + amt;
  const { error: cardErr } = await admin.from("cards").update({
    balance: newBalance,
    currency_code: currency,
    wallet_id: card.wallet_id || walletId,
  }).eq("id", cardId);
  if (cardErr) {
    console.error("fundFromWallet card update error:", cardErr);
    return jsonResponse({ error: formatDbError(cardErr) }, 400);
  }

  const { error: xferErr } = await admin.from("virtual_card_transfers").insert({
    user_id: userId,
    from_wallet_id: walletId,
    to_card_id: cardId,
    amount: amt,
    currency_code: currency,
    transfer_type: "wallet_to_card",
  });
  if (xferErr) {
    console.error("fundFromWallet transfer log error:", xferErr);
    // Card balance already updated — don't fail the fund over audit log.
  }

  return jsonResponse({ ok: true, card_balance: newBalance, currency });
}

async function transferBetweenCards(admin: Sb, userId: string, body: Record<string, unknown>) {
  const fromId = String(body.from_card_id || "");
  const toId = String(body.to_card_id || "");
  const amt = Number(body.amount);
  if (!fromId || !toId || fromId === toId || !(amt > 0)) {
    return jsonResponse({ error: "Invalid transfer" }, 400);
  }

  const { data: fromCard } = await admin.from("cards").select("*").eq("id", fromId).maybeSingle();
  const { data: toCard } = await admin.from("cards").select("*").eq("id", toId).maybeSingle();

  if (!fromCard || fromCard.user_id !== userId) return jsonResponse({ error: "Source card not found" }, 404);
  if (!toCard || toCard.user_id !== userId) return jsonResponse({ error: "Destination card not found" }, 404);
  if (fromCard.status !== "active" || toCard.status !== "active") {
    return jsonResponse({ error: "Both cards must be active" }, 400);
  }
  if (fromCard.funding_source === "external" || toCard.funding_source === "external") {
    return jsonResponse({ error: "Transfers only work between issued virtual cards" }, 400);
  }

  const fromCur = fromCard.currency_code;
  const toCur = toCard.currency_code;
  if (!fromCur || !toCur || fromCur !== toCur) {
    return jsonResponse({ error: "Cards must use the same currency" }, 400);
  }

  const fromBal = Number(fromCard.balance || 0);
  if (fromBal < amt) return jsonResponse({ error: "Insufficient card balance" }, 400);

  const toBal = Number(toCard.balance || 0);

  const { error: e1 } = await admin.from("cards").update({ balance: fromBal - amt }).eq("id", fromId);
  if (e1) throw e1;
  const { error: e2 } = await admin.from("cards").update({ balance: toBal + amt }).eq("id", toId);
  if (e2) throw e2;

  await admin.from("virtual_card_transfers").insert({
    user_id: userId,
    from_card_id: fromId,
    to_card_id: toId,
    amount: amt,
    currency_code: fromCur,
    transfer_type: "card_to_card",
  });

  return jsonResponse({
    ok: true,
    from_balance: fromBal - amt,
    to_balance: toBal + amt,
    currency: fromCur,
  });
}
