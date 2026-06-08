// Stripe Treasury webhook -> ledger postings
import { corsHeaders, json, admin, stripe } from "../_shared/treasury.ts";

const WEBHOOK_SECRET = Deno.env.get("STRIPE_TREASURY_WEBHOOK_SECRET")!;

async function getAccountIds(currency: string) {
  const db = admin();
  const codes = ["1270", "1271", "2120"];
  const { data } = await db.from("ledger_accounts").select("id, code").in("code", codes);
  const m: Record<string, string> = {};
  (data ?? []).forEach((r: any) => { m[r.code] = r.id; });
  return m;
}

async function postJournal(opts: {
  drAccountId: string;
  crAccountId: string;
  amount: number;
  currency: string;
  description: string;
  externalRef: string;
  userId?: string | null;
}) {
  const db = admin();
  const journalId = crypto.randomUUID();
  const base = {
    journal_id: journalId,
    currency_code: opts.currency,
    description: opts.description,
    reference_type: "stripe_treasury",
    external_reference: opts.externalRef,
    created_by: opts.userId ?? null,
  };
  const { error } = await db.from("ledger_entries").insert([
    { ...base, account_id: opts.drAccountId, debit_amount: opts.amount, credit_amount: 0 },
    { ...base, account_id: opts.crAccountId, debit_amount: 0, credit_amount: opts.amount },
  ]);
  if (error) throw new Error(error.message);
  return journalId;
}

async function findFaByStripeId(stripeFaId: string) {
  const db = admin();
  const { data } = await db
    .from("treasury_financial_accounts")
    .select("*")
    .eq("stripe_fa_id", stripeFaId)
    .maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing signature" }, 400);

  const raw = await req.text();
  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET);
  } catch (e: any) {
    console.error("webhook signature", e?.message);
    return json({ error: "Invalid signature" }, 400);
  }

  const db = admin();
  // Idempotency
  const { data: existing } = await db
    .from("treasury_webhook_events")
    .select("id, processed_at")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existing?.processed_at) return json({ received: true, idempotent: true });
  if (!existing) {
    await db.from("treasury_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event,
    });
  }

  try {
    const obj = event.data.object;
    const type: string = event.type;
    const accounts = await getAccountIds("USD");
    const trAsset = accounts["1270"];
    const trIntransit = accounts["1271"];
    const trLiab = accounts["2120"];

    // Helper: figure out owner liability/clearing target account
    async function ownerCounterAccount(faRow: any) {
      // user FA -> customer treasury liability; platform FA -> Stripe Settlement USD (1202)
      if (faRow?.owner_kind === "user") return trLiab;
      const { data } = await db.from("ledger_accounts").select("id").eq("code", "1202").maybeSingle();
      return data?.id ?? trLiab;
    }

    if (type.startsWith("treasury.financial_account.")) {
      // Sync balances/status
      const fa = obj;
      await db
        .from("treasury_financial_accounts")
        .update({
          status: fa.status,
          balance_available: ((fa.balance?.cash?.usd ?? 0) / 100),
          balance_pending: ((fa.balance?.inbound_pending?.usd ?? 0) / 100),
          metadata: { active_features: fa.active_features ?? [] },
        })
        .eq("stripe_fa_id", fa.id);
    }
    else if (type.startsWith("treasury.inbound_transfer.")) {
      const it = obj;
      const fa = await findFaByStripeId(it.financial_account);
      const amount = (it.amount ?? 0) / 100;
      let journalId: string | null = null;
      if (fa && (type === "treasury.inbound_transfer.succeeded" || type === "treasury.inbound_transfer.processing")) {
        const counter = await ownerCounterAccount(fa);
        journalId = await postJournal({
          drAccountId: trAsset,
          crAccountId: counter,
          amount,
          currency: "USD",
          description: `Treasury inbound transfer ${it.id}`,
          externalRef: it.id,
          userId: fa.user_id,
        });
      }
      await db
        .from("treasury_transfers")
        .update({ status: it.status, failure_reason: it.failure_details?.code ?? null, journal_id: journalId ?? undefined })
        .eq("stripe_id", it.id);
    }
    else if (type.startsWith("treasury.outbound_transfer.") || type.startsWith("treasury.outbound_payment.")) {
      const ot = obj;
      const fa = await findFaByStripeId(ot.financial_account);
      const amount = (ot.amount ?? 0) / 100;
      let journalId: string | null = null;
      if (fa && (type.endsWith(".posted") || type.endsWith(".processing"))) {
        const counter = await ownerCounterAccount(fa);
        journalId = await postJournal({
          drAccountId: counter,
          crAccountId: trAsset,
          amount,
          currency: "USD",
          description: `Treasury outbound ${ot.id}`,
          externalRef: ot.id,
          userId: fa.user_id,
        });
      }
      await db
        .from("treasury_transfers")
        .update({ status: ot.status, failure_reason: ot.returned_details?.code ?? null, journal_id: journalId ?? undefined })
        .eq("stripe_id", ot.id);
    }
    else if (type.startsWith("treasury.received_credit.") || type.startsWith("treasury.received_debit.")) {
      const rc = obj;
      const fa = await findFaByStripeId(rc.financial_account);
      const amount = (rc.amount ?? 0) / 100;
      const isCredit = type.startsWith("treasury.received_credit.");
      let journalId: string | null = null;
      if (fa && rc.status === "succeeded") {
        const counter = await ownerCounterAccount(fa);
        journalId = await postJournal({
          drAccountId: isCredit ? trAsset : counter,
          crAccountId: isCredit ? counter : trAsset,
          amount,
          currency: "USD",
          description: `Treasury ${isCredit ? "received credit" : "received debit"} ${rc.id}`,
          externalRef: rc.id,
          userId: fa.user_id,
        });
      }
      await db.from("treasury_received_entries").upsert({
        stripe_id: rc.id,
        fa_id: fa?.id,
        user_id: fa?.user_id ?? null,
        kind: isCredit ? "received_credit" : "received_debit",
        amount,
        currency: "USD",
        status: rc.status ?? "succeeded",
        network: rc.network ?? null,
        counterparty: rc.initiating_payment_method_details ?? {},
        description: rc.description ?? null,
        journal_id: journalId,
      }, { onConflict: "stripe_id" });
    }

    await db.from("treasury_webhook_events").update({ processed_at: new Date().toISOString() }).eq("stripe_event_id", event.id);
    return json({ received: true });
  } catch (e: any) {
    console.error("treasury-webhook error", e);
    await db.from("treasury_webhook_events").update({ error: e?.message ?? String(e) }).eq("stripe_event_id", event.id);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
