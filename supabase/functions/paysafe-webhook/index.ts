import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paysafe-signature",
};

const WEBHOOK_SECRET = Deno.env.get("PAYSAFE_WEBHOOK_SECRET") || "";

async function verifySig(rawBody: string, sigHeader: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // not enforced
  if (!sigHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sigHeader.replace(/^sha256=/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const raw = await req.text();
    const sig = req.headers.get("paysafe-signature") || req.headers.get("x-paysafe-signature");
    const ok = await verifySig(raw, sig);
    if (!ok) {
      return new Response("Invalid signature", { status: 401, headers: corsHeaders });
    }

    const event = JSON.parse(raw || "{}");
    // Paysafe sends merchantRefNum which we set to "EFM-{transfer_id}"
    const ref: string = event?.merchantRefNum || event?.payload?.merchantRefNum || "";
    const status: string = (event?.eventType || event?.status || event?.payload?.status || "").toUpperCase();
    const paysafeId: string | null = event?.id || event?.payload?.id || null;

    if (!ref.startsWith("EFM-")) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const transferId = ref.slice(4);

    let newStatus: string | null = null;
    let failure: string | null = null;
    if (["COMPLETED", "DELIVERED", "DEPOSITED", "RECEIVED"].some((s) => status.includes(s))) {
      newStatus = "completed";
    } else if (["FAILED", "DECLINED", "CANCELLED", "EXPIRED", "RETURNED"].some((s) => status.includes(s))) {
      newStatus = "failed";
      failure = `Paysafe: ${status}`;
    } else if (status.includes("PROCESSING") || status.includes("PENDING")) {
      newStatus = "processing";
    }

    if (newStatus) {
      const update: Record<string, unknown> = { status: newStatus };
      if (failure) update.failure_reason = failure;
      if (paysafeId) update.paysafe_payment_id = paysafeId;
      if (newStatus === "completed") update.completed_at = new Date().toISOString();
      await supabase.from("transfers").update(update).eq("id", transferId);

      // On failure: refund the wallet by reversing the original journal
      if (newStatus === "failed") {
        const { data: t } = await supabase.from("transfers").select("*").eq("id", transferId).single();
        if (t) {
          const { data: liabAcc } = await supabase
            .from("ledger_accounts").select("id").like("code", "21%")
            .eq("currency_code", t.source_currency).limit(1).single();
          if (liabAcc) {
            const journalId = crypto.randomUUID();
            await supabase.from("ledger_entries").insert([{
              journal_id: journalId,
              account_id: liabAcc.id,
              wallet_id: t.sender_wallet_id,
              currency_code: t.source_currency,
              debit_amount: 0,
              credit_amount: Number(t.source_amount) + Number(t.fee_amount || 0),
              description: `Refund (Paysafe failure) for transfer ${transferId}`,
              reference_type: "transfer_refund",
              reference_id: transferId,
              created_by: t.sender_id,
            }]);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("paysafe-webhook error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
