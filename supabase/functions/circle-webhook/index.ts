// Circle webhook handler. Verifies signature, dedupes event, advances transfer state.
// Signature: Circle signs with ECDSA P-256; the public key is provided as PEM in
// CIRCLE_WEBHOOK_PUBLIC_KEY. The signature is sent in `X-Circle-Signature` header
// over the raw request body.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_KEY_PEM = Deno.env.get("CIRCLE_WEBHOOK_PUBLIC_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-circle-signature") ?? req.headers.get("circle-signature");

  // Verify signature (best-effort; if no public key configured, log & accept for now)
  if (PUBLIC_KEY_PEM && sigHeader) {
    const ok = await verifyEcdsa(rawBody, sigHeader, PUBLIC_KEY_PEM).catch(() => false);
    if (!ok) {
      console.error("Circle webhook signature verification failed");
      return new Response("Invalid signature", { status: 401 });
    }
  } else if (PUBLIC_KEY_PEM && !sigHeader) {
    return new Response("Missing signature", { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const eventId: string = event.id ?? event.eventId ?? event.notificationId ?? crypto.randomUUID();
  const eventType: string = event.type ?? event.notificationType ?? "unknown";

  // Dedupe
  const { data: existing } = await admin.from("circle_webhook_events")
    .select("id, processed_at").eq("circle_event_id", eventId).maybeSingle();
  if (existing?.processed_at) {
    return new Response(JSON.stringify({ ok: true, deduped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!existing) {
    await admin.from("circle_webhook_events").insert({
      circle_event_id: eventId, event_type: eventType, payload: event,
    });
  }

  // Extract Circle transfer id from common shapes
  const data = event.data ?? event;
  const circleTransferId: string | null = data?.id ?? data?.transferId ?? data?.transfer?.id ?? null;
  const newStatus: string | null = data?.status ?? data?.transfer?.status ?? null;

  if (circleTransferId) {
    const { data: transfer } = await admin.from("transfers").select("*")
      .eq("circle_transfer_id", circleTransferId).maybeSingle();

    if (transfer) {
      const update: Record<string, unknown> = {
        circle_status: newStatus ?? transfer.circle_status,
        circle_payload: event,
      };

      const normalized = (newStatus ?? "").toLowerCase();
      if (["complete", "completed", "paid", "settled"].includes(normalized)) {
        update.status = "completed";
        update.completed_at = new Date().toISOString();
        // PDF receipt + completion email already fired by `notify_transfer_completed_receipt` trigger
      } else if (["failed", "rejected", "cancelled", "returned"].includes(normalized)) {
        update.status = "failed";
        update.failure_reason = data?.failureReason ?? data?.reason ?? `Circle status: ${newStatus}`;
        // Refund the user wallet — reverse the original lock
        await refundUser(admin, transfer);
      } else if (["processing", "pending", "in_progress"].includes(normalized)) {
        update.status = "processing";
      }

      await admin.from("transfers").update(update).eq("id", transfer.id);
    }
  }

  await admin.from("circle_webhook_events").update({ processed_at: new Date().toISOString() })
    .eq("circle_event_id", eventId);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function refundUser(admin: any, transfer: any) {
  // Look up the original lock journal by reference_id and create reversal entries.
  const { data: orig } = await admin.from("ledger_entries").select("*")
    .eq("reference_id", transfer.id).eq("reference_type", "cpn_transfer");
  if (!orig || orig.length === 0) return;
  const journalId = crypto.randomUUID();
  const reversal = orig.map((e: any) => ({
    journal_id: journalId,
    account_id: e.account_id,
    wallet_id: e.wallet_id,
    currency_code: e.currency_code,
    debit_amount: e.credit_amount,
    credit_amount: e.debit_amount,
    description: `Refund (Circle failed): ${e.description}`,
    reference_type: "cpn_refund",
    reference_id: transfer.id,
    created_by: transfer.sender_id,
  }));
  await admin.from("ledger_entries").insert(reversal);
}

async function verifyEcdsa(body: string, signatureB64: string, publicKeyPem: string): Promise<boolean> {
  try {
    const pemBody = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/g, "")
      .replace(/-----END PUBLIC KEY-----/g, "")
      .replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "spki", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
    const sig = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    const data = new TextEncoder().encode(body);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, data);
  } catch (e) {
    console.error("verifyEcdsa error", e);
    return false;
  }
}
