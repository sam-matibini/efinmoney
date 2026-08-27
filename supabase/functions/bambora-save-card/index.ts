/**
 * Save a Bambora payment profile card from Custom Checkout token.
 * Body: { token, name, currency?, saveAsDefault?, chargeAmount?, walletId? }
 * If chargeAmount + walletId provided, also charges after save.
 */
import {
  bamboraAddCardToProfile,
  bamboraCreateProfileFromToken,
  bamboraGetProfile,
  getBamboraConfig,
  isBamboraPaymentApproved,
  bamboraTxnId,
} from "../_shared/bambora.ts";
import { creditWalletViaBambora } from "../_shared/bambora-credit.ts";
import {
  bamboraCustomerCode,
  corsHeaders,
  json,
  requireUser,
  supportedBamboraCurrency,
  validateTopupAmount,
} from "../_shared/bambora-auth.ts";
import { syncBamboraProfileToDb, upsertBamboraCardRow } from "../_shared/bambora-profiles-db.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user, admin, profile } = auth;

    const cfg = getBamboraConfig();
    if (!cfg.merchantId || !cfg.profilesPasscode) {
      return json(503, { error: "Bambora profiles not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    const name = String(body.name || "Cardholder").trim() || "Cardholder";
    const currency = String(body.currency || "CAD").toUpperCase();
    const saveAsDefault = Boolean(body.saveAsDefault ?? body.save_as_default ?? true);
    const chargeAmount = body.chargeAmount != null ? Number(body.chargeAmount) : null;
    const walletId = body.walletId ? String(body.walletId) : "";

    if (!token) return json(400, { error: "Card token required" });
    if (!supportedBamboraCurrency(currency)) {
      return json(400, { error: "Bambora supports CAD and USD only" });
    }

    const customerCode = bamboraCustomerCode(user.id);
    const email = String(profile?.email || user.email || "");

    let profileRes = await bamboraGetProfile(customerCode);
    let cardPayload: Record<string, unknown> | null = null;

    if (profileRes.status === 404) {
      profileRes = await bamboraCreateProfileFromToken({
        customerCode,
        token,
        name,
        email,
        validate: true,
      });
      if (!profileRes.ok) {
        return json(400, {
          error: String(profileRes.json.message || "Could not create payment profile"),
          bambora: profileRes.json,
        });
      }
      cardPayload = (profileRes.json.card as Record<string, unknown>) || profileRes.json;
    } else {
      const addRes = await bamboraAddCardToProfile(customerCode, token, name);
      if (!addRes.ok) {
        return json(400, {
          error: String(addRes.json.message || "Could not save card to profile"),
          bambora: addRes.json,
        });
      }
      cardPayload = (addRes.json.card as Record<string, unknown>) || addRes.json;
    }

    await upsertBamboraCardRow(admin, user.id, customerCode, cardPayload || {}, currency, saveAsDefault);
    await syncBamboraProfileToDb(admin, user.id, customerCode, currency);

    let chargeResult: Record<string, unknown> | null = null;
    if (chargeAmount != null && walletId) {
      const amtErr = validateTopupAmount(chargeAmount, currency);
      if (amtErr) return json(400, { error: amtErr });

      const { data: wallet } = await admin.from("wallets").select("id, user_id, currency_code")
        .eq("id", walletId).maybeSingle();
      if (!wallet || wallet.user_id !== user.id) return json(403, { error: "Wallet not found" });
      if (String(wallet.currency_code).toUpperCase() !== currency) {
        return json(400, { error: `Wallet currency is ${wallet.currency_code}` });
      }

      const { data: saved } = await admin.from("bambora_payment_methods")
        .select("bambora_card_id")
        .eq("user_id", user.id)
        .eq("customer_code", customerCode)
        .eq("method_type", "card")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cardId = Number(saved?.bambora_card_id || cardPayload?.card_id || 0);
      if (!cardId) {
        return json(400, { error: "Card saved but card_id missing — charge separately", saved: true });
      }

      const { bamboraChargeProfile } = await import("../_shared/bambora.ts");
      const orderNumber = `efm${Date.now().toString(36)}`.slice(0, 30);
      const charged = await bamboraChargeProfile({
        customerCode,
        cardId,
        amount: chargeAmount,
        currency,
        orderNumber,
        customer: {
          name,
          email: email || undefined,
        },
      });
      const approved = isBamboraPaymentApproved(charged.json);
      const txnId = bamboraTxnId(charged.json);
      if (!charged.ok || !approved || !txnId) {
        return json(400, {
          error: String(charged.json.message || "Charge failed after save"),
          saved: true,
          bambora: charged.json,
        });
      }
      const creditAmount = Number(charged.json.amount ?? chargeAmount);
      const { already } = await creditWalletViaBambora(
        admin, user.id, currency, creditAmount, `bambora:${txnId}`, walletId,
        `Wallet top-up via Bambora (${txnId})`,
      );
      chargeResult = {
        success: true,
        credited: !already,
        transaction_id: txnId,
        amount: creditAmount,
      };
    }

    const { data: methods } = await admin.from("bambora_payment_methods")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return json(200, {
      success: true,
      customer_code: customerCode,
      methods: methods ?? [],
      charge: chargeResult,
    });
  } catch (err) {
    console.error("bambora-save-card", err);
    return json(500, { error: err instanceof Error ? err.message : "Save failed" });
  }
});
