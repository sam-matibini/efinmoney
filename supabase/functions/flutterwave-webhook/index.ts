import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTopupEmail } from "../_shared/topup-email.ts";
import { recordObservedPartnerCost } from "../_shared/observedPartnerCost.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "verif-hash, content-type",
};

type SbAdmin = ReturnType<typeof createClient>;

async function reverseTransferLedger(supabase: SbAdmin, transferId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing && existing.length > 0) return false;
  const { data: originals } = await supabase
    .from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (!originals || originals.length === 0) return false;
  const journalId = crypto.randomUUID();
  const rows = originals.map((o) => ({
    journal_id: journalId, account_id: o.account_id, wallet_id: o.wallet_id, currency_code: o.currency_code,
    debit_amount: o.credit_amount, credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal", reference_id: transferId,
  }));
  const { error } = await supabase.from("ledger_entries").insert(rows);
  if (error) { console.error("reverseTransferLedger insert failed", error); return false; }
  return true;
}

async function creditWallet(
  supabase: SbAdmin,
  userId: string,
  walletId: string,
  currency: string,
  amount: number,
  idempotencyRef: string,   // e.g. FLW transaction_id — guarantees no double-credit
  desc: string,
  source: "flutterwave" | "virtual_account" = "flutterwave",
) {
  // Idempotency: skip if this FLW transaction was already posted
  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "flw_topup").eq("external_reference", idempotencyRef).limit(1);
  if (existing && existing.length > 0) {
    console.log("creditWallet: already posted", idempotencyRef);
    return false;
  }

  // Asset (debit) — Flutterwave Settlement for this currency
  const { data: asset } = await supabase.from("ledger_accounts")
    .select("id").eq("currency_code", currency)
    .ilike("name", "Flutterwave Settlement%")
    .limit(1).maybeSingle();

  // Liability (credit) — Customer Wallet Liability for this currency (code 21xx)
  const { data: liab } = await supabase.from("ledger_accounts")
    .select("id").like("code", "21%").eq("currency_code", currency)
    .ilike("name", "Customer Wallet Liability%")
    .limit(1).maybeSingle();

  if (!asset || !liab) {
    console.error("creditWallet: missing ledger accounts for", currency, { asset: !!asset, liab: !!liab });
    return false;
  }

  const journalId = crypto.randomUUID();
  const { error } = await supabase.from("ledger_entries").insert([
    { journal_id: journalId, account_id: asset.id, wallet_id: null, currency_code: currency,
      debit_amount: amount, credit_amount: 0, description: desc,
      reference_type: "flw_topup", external_reference: idempotencyRef },
    { journal_id: journalId, account_id: liab.id, wallet_id: walletId, currency_code: currency,
      debit_amount: 0, credit_amount: amount, description: desc,
      reference_type: "flw_topup", external_reference: idempotencyRef },
  ]);
  if (error) { console.error("creditWallet insert failed", error); return false; }

  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Top-up successful",
    message: `Your top-up of ${amount} ${currency} was successful.`,
    type: "transfer",
  });
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let bodyText = "";
  let event: Record<string, unknown> = {};
  try {
    bodyText = await req.text();
    event = bodyText ? JSON.parse(bodyText) : {};
  } catch (e) {
    console.warn("webhook parse failed", e);
  }

  // Signature verification — FAIL CLOSED when secret missing or signature mismatch.
  const expected = (Deno.env.get("FLW_WEBHOOK_HASH") || Deno.env.get("FLW_WEBHOOK_SECRET_HASH") || "").trim();
  const provided = req.headers.get("verif-hash") || "";
  if (!expected) {
    console.error("FLW_WEBHOOK_HASH not configured — rejecting webhook");
    return new Response(JSON.stringify({ error: "Webhook signing secret not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (provided !== expected) {
    console.warn("Flutterwave webhook hash mismatch");
    await supabase.from("flw_webhook_logs").insert({ event: String((event as { event?: string }).event || "unknown"), payload: event, processed: false, error: "signature_mismatch" });
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const eventName = String((event as { event?: string }).event || "");
  let logId: string | null = null;
  try {
    const { data: log } = await supabase.from("flw_webhook_logs").insert({ event: eventName, payload: event, processed: false }).select("id").single();
    logId = log?.id ?? null;
  } catch (e) { console.warn("webhook log insert failed", e); }

  try {
    const data = (event as { data?: Record<string, unknown> }).data || event;
    const flwId = String((data as { id?: unknown }).id || "");
    const reference = (data as { reference?: string; tx_ref?: string }).reference || (data as { tx_ref?: string }).tx_ref || "";
    const status = String((data as { status?: string }).status || "").toLowerCase();
    const meta = Array.isArray((data as { meta?: unknown }).meta) ? (data as { meta: Array<Record<string, unknown>> }).meta[0] : (data as { meta?: Record<string, unknown> }).meta || {};

    // ---- charge.completed (top-up or virtual account credit)
    // V3 statuses: successful/success. V4 statuses: succeeded/successful.
    if (eventName === "charge.completed" || (data as { tx_ref?: string }).tx_ref || (data as { reference?: string }).reference) {
      if (["successful", "success", "succeeded", "paid", "completed"].includes(status)) {
        const amount = Number((data as { amount?: number }).amount || 0);
        const currency = String((data as { currency?: string }).currency || "").toUpperCase();
        const userIdMeta = meta?.user_id ? String(meta.user_id) : null;
        const txType = meta?.type ? String(meta.type) : null;

        // Top-up flow (initialized via /payments)
        if (userIdMeta && (txType === "wallet_topup" || String(reference).startsWith("efm_topup_") || String(reference).startsWith("efmtopup-") || String(reference).startsWith("topup-"))) {
          const walletIdMeta = meta?.wallet_id ? String(meta.wallet_id) : null;
          let walletId: string | undefined;

          if (walletIdMeta) {
            // Verify wallet belongs to this user and matches currency
            const { data: w } = await supabase.from("wallets")
              .select("id, user_id, currency_code")
              .eq("id", walletIdMeta).maybeSingle();
            if (w && w.user_id === userIdMeta && String(w.currency_code).toUpperCase() === currency) {
              walletId = w.id as string;
            } else {
              console.warn("wallet_id from meta failed validation, falling back to user+currency lookup", { walletIdMeta, userIdMeta, currency });
            }
          }

          if (!walletId) {
            const { data: wallet } = await supabase.from("wallets")
              .select("id").eq("user_id", userIdMeta).eq("currency_code", currency).maybeSingle();
            walletId = wallet?.id as string | undefined;
            if (!walletId) {
              const { data: nw } = await supabase.from("wallets")
                .insert({ user_id: userIdMeta, currency_code: currency, is_default: false })
                .select("id").single();
              walletId = nw!.id as string;
            }
          }

          // Idempotency keyed on merchant tx_ref (same as flw-verify-payment)
          const idempotencyRef = String(reference || flwId || "").trim();
          if (!idempotencyRef || !(amount > 0)) {
            console.warn("flutterwave-webhook: skipping credit — missing ref or amount", { reference, flwId, amount });
          } else {
            // Skip if already credited under either tx_ref or FLW id
            const { data: existingAny } = await supabase.from("ledger_entries").select("id")
              .eq("reference_type", "flw_topup")
              .in("external_reference", [idempotencyRef, flwId].filter(Boolean))
              .limit(1);
            if (existingAny?.length) {
              console.log("flutterwave-webhook: already posted", idempotencyRef);
            } else {
              const credited = await creditWallet(
                supabase, userIdMeta, walletId, currency, amount,
                idempotencyRef, `Top-up via Flutterwave (txn ${flwId}, ref ${reference})`,
              );
              if (credited) {
                sendTopupEmail(supabase, userIdMeta, currency, amount, idempotencyRef).catch(() => {});
              }
            }
          }
        }
        // Virtual account credit
        else {
          const acctNum = String((data as { account_number?: string }).account_number || (data as { account?: { account_number?: string } }).account?.account_number || "");
          if (acctNum) {
            const { data: va } = await supabase.from("virtual_accounts").select("user_id, wallet_id, currency_code").eq("account_number", acctNum).maybeSingle();
            if (va?.user_id && va?.wallet_id) {
              await creditWallet(supabase, va.user_id, va.wallet_id, va.currency_code || currency, amount, String(reference || flwId), `Virtual account deposit ${flwId}`);
            }
          }
        }
      }
    }

    // ---- transfer events (existing logic)
    // reference format: "EFM-{uuid}-{timestamp}". UUIDs contain hyphens, so we
    // can't just split("-")[1] — extract the full 36-char UUID instead.
    const refStr = typeof reference === "string" ? reference : "";
    const uuidMatch = refStr.match(/^EFM-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const transferId = (meta as { transfer_id?: string })?.transfer_id || (uuidMatch ? uuidMatch[1] : null);
    if ((eventName.startsWith("transfer.") || transferId || /transfer/i.test(String((data as { entity?: string }).entity || ""))) && (transferId || flwId)) {
      let q = supabase.from("transfers").select("*");
      q = transferId ? q.eq("id", transferId) : q.eq("provider_reference", flwId);
      const { data: transfers } = await q.limit(1);
      const transfer = transfers?.[0];
      if (transfer) {
        let newStatus: string | null = null;
        let title = "", message = "";
        if (status === "successful" || status === "success" || status === "succeeded" || status === "completed") {
          newStatus = "completed";
          title = "Transfer completed";
          message = `Your transfer of ${transfer.target_currency} ${transfer.target_amount} to ${transfer.recipient_name} is complete.`;
        } else if (status === "failed" || status === "reversed") {
          newStatus = "failed";
          title = "Transfer failed";
          message = `Your transfer to ${transfer.recipient_name} has failed.`;
        }
        if (newStatus) {
          let refunded = false;
          if (newStatus === "failed") {
            refunded = await reverseTransferLedger(supabase, transfer.id);
            if (refunded) { title = "Transfer failed — refunded"; message = `Your transfer to ${transfer.recipient_name} failed and has been refunded.`; }
          }
          await supabase.from("transfers").update({
            status: newStatus,
            provider_reference: flwId || transfer.provider_reference,
            failure_reason: newStatus === "failed" ? ((data as { complete_message?: string }).complete_message || status) : transfer.failure_reason,
            completed_at: newStatus === "completed" ? new Date().toISOString() : transfer.completed_at,
          }).eq("id", transfer.id);
          await supabase.from("notifications").insert({ user_id: transfer.sender_id, title, message, type: newStatus === "completed" ? "transfer" : "error" });

          // Capture what Flutterwave actually billed us so pricing drift is
          // measured on real invoices, not just the contracted rate card.
          if (newStatus === "completed") {
            const d = data as { fee?: number; app_fee?: number; charged_amount?: number };
            const observedFee = Number(d.fee ?? d.app_fee ?? 0);
            if (Number.isFinite(observedFee) && observedFee > 0) {
              await recordObservedPartnerCost(supabase, {
                partnerCode: "flutterwave",
                transferId: transfer.id,
                direction: "payout",
                sourceCurrency: String(transfer.source_currency ?? ""),
                destCurrency: transfer.target_currency ? String(transfer.target_currency) : null,
                destCountry: transfer.recipient_country ? String(transfer.recipient_country) : null,
                paymentMethod: transfer.payout_method ? String(transfer.payout_method) : null,
                amount: Number(transfer.target_amount ?? transfer.source_amount ?? 0),
                observedFee,
                feeCurrency: String(transfer.target_currency ?? transfer.source_currency ?? ""),
                providerReference: flwId ? String(flwId) : null,
              });
            }
          }
        }
      }
    }

    // ---- bill payment events
    if (eventName.startsWith("bill") || (typeof reference === "string" && reference.startsWith("efm_bill_"))) {
      const { data: bill } = await supabase.from("bill_payments").select("*").eq("reference", reference).maybeSingle();
      if (bill) {
        const ok = status === "successful" || status === "success" || status === "completed";
        await supabase.from("bill_payments").update({
          status: ok ? "successful" : (status === "failed" ? "failed" : bill.status),
          token: (data as { token?: string }).token || bill.token,
          units: (data as { units?: string }).units || bill.units,
          flw_response: data,
        }).eq("id", bill.id);
      }
    }

    if (logId) await supabase.from("flw_webhook_logs").update({ processed: true }).eq("id", logId);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flutterwave-webhook error", err);
    if (logId) await supabase.from("flw_webhook_logs").update({ processed: false, error: err instanceof Error ? err.message : "unknown" }).eq("id", logId);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
