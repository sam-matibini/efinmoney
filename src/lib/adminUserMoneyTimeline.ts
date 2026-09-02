import { supabase } from "@/integrations/supabase/client";

export type MoneySurface = "send" | "topup";

export type UserMoneyEvent = {
  id: string;
  surface: MoneySurface;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  detail: string;
  reference: string | null;
  transferId: string | null;
  createdAt: string;
  failure: string | null;
};

function inferProviderFromTransfer(row: {
  provider_charge_id?: string | null;
  provider_reference?: string | null;
  rails_attempted?: string[] | null;
}): string {
  const charge = String(row.provider_charge_id || "").toLowerCase();
  const ref = String(row.provider_reference || "").toLowerCase();
  const rails = (row.rails_attempted || []).map((r) => String(r).toLowerCase());

  const known = ["nomba", "fincra", "flutterwave", "flovide", "square", "paypal", "dodo", "wise", "paytota", "swychr", "lenhub"];
  for (const k of known) {
    if (charge.includes(k) || ref.includes(k) || rails.includes(k)) return k;
  }
  if (rails.length) return rails[rails.length - 1];
  if (charge.startsWith("rail:")) return charge.slice(5) || "unknown";
  return "unknown";
}

/**
 * Unified send + top-up timeline for one user (admin 360° view).
 * Pulls transfers and known collect tables; labels provider + surface.
 */
export async function fetchUserMoneyTimeline(userId: string, limit = 100): Promise<UserMoneyEvent[]> {
  const [
    transfersRes,
    nombaPayRes,
    fincraInteracRes,
    squareRes,
    dodoRes,
  ] = await Promise.all([
    supabase
      .from("transfers")
      .select(
        "id, recipient_name, recipient_country, source_amount, source_currency, target_amount, target_currency, status, payout_method, provider_charge_id, provider_reference, rails_attempted, failure_reason, created_at",
      )
      .eq("sender_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("nomba_pay_transactions")
      .select("id, reference, provider_reference, amount, currency, status, corridor, failure_reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("fincra_cad_interac_intents")
      .select("id, reference, provider_reference, amount, currency_code, status, purpose, unmatched_reason, transfer_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("square_checkout_intents")
      .select("id, amount, currency, status, payment_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("dodo_payin_transactions")
      .select("id, amount, currency, status, payment_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const events: UserMoneyEvent[] = [];

  for (const t of transfersRes.data ?? []) {
    const provider = inferProviderFromTransfer(t);
    events.push({
      id: `send-${t.id}`,
      surface: "send",
      provider,
      amount: Number(t.target_amount ?? t.source_amount),
      currency: t.target_currency || t.source_currency,
      status: t.status,
      detail: `${t.source_currency}→${t.target_currency} · ${t.recipient_name || "—"}${
        t.recipient_country ? ` (${t.recipient_country})` : ""
      }${t.payout_method ? ` · ${t.payout_method}` : ""}`,
      reference: t.provider_reference,
      transferId: t.id,
      createdAt: t.created_at,
      failure: t.failure_reason,
    });
  }

  for (const r of nombaPayRes.data ?? []) {
    events.push({
      id: `nomba-pay-${r.id}`,
      surface: "topup",
      provider: "nomba",
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      detail: r.corridor ? `Nomba checkout · ${r.corridor}` : "Nomba checkout",
      reference: r.provider_reference || r.reference,
      transferId: null,
      createdAt: r.created_at,
      failure: r.failure_reason,
    });
  }

  for (const r of fincraInteracRes.data ?? []) {
    events.push({
      id: `fincra-interac-${r.id}`,
      surface: "topup",
      provider: "fincra",
      amount: Number(r.amount),
      currency: r.currency_code || "CAD",
      status: r.status,
      detail: r.purpose ? `CAD Interac · ${r.purpose}` : "CAD Interac (Fincra)",
      reference: r.provider_reference || r.reference,
      transferId: r.transfer_id,
      createdAt: r.created_at,
      failure: r.unmatched_reason,
    });
  }

  for (const r of squareRes.data ?? []) {
    events.push({
      id: `square-${r.id}`,
      surface: "topup",
      provider: "square",
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      detail: "Square checkout",
      reference: r.payment_id,
      transferId: null,
      createdAt: r.created_at,
      failure: null,
    });
  }

  for (const r of dodoRes.data ?? []) {
    events.push({
      id: `dodo-${r.id}`,
      surface: "topup",
      provider: "dodo",
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      detail: "Dodo checkout",
      reference: r.payment_id,
      transferId: null,
      createdAt: r.created_at,
      failure: null,
    });
  }

  // Soft-fail individual query errors — still return what we got
  const errs = [
    transfersRes.error,
    nombaPayRes.error,
    fincraInteracRes.error,
    squareRes.error,
    dodoRes.error,
  ].filter(Boolean);
  if (errs.length && events.length === 0) {
    throw errs[0];
  }

  events.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return events.slice(0, limit);
}
