// Send a statement attachment via Resend.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM = "eFinMoney Statements <noreply@efinsuite.com>";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to, title, subtitle, period_from, period_to, account_holder, filename, mime, attachment_base64 } = body;

    if (!to || !attachment_base64 || !filename) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
        <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(title || "Your eFinMoney statement")}</h1>
        ${subtitle ? `<p style="color:#475569;margin:0 0 8px">${escapeHtml(subtitle)}</p>` : ""}
        ${account_holder ? `<p style="margin:4px 0"><strong>Account holder:</strong> ${escapeHtml(account_holder)}</p>` : ""}
        ${(period_from || period_to) ? `<p style="margin:4px 0"><strong>Period:</strong> ${escapeHtml(period_from || "—")} to ${escapeHtml(period_to || "—")}</p>` : ""}
        <p style="line-height:1.55;margin-top:16px">Your statement is attached to this email as <strong>${escapeHtml(filename)}</strong>.</p>
        <p style="color:#64748b;font-size:12px;margin-top:32px">— eFinMoney · efin.money</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: title || "Your eFinMoney statement",
        html,
        attachments: [
          { filename, content: attachment_base64, content_type: mime || "application/octet-stream" },
        ],
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      console.error("Resend error", errTxt);
      return new Response(JSON.stringify({ error: "Email provider rejected the request" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const out = await res.json();
    return new Response(JSON.stringify({ ok: true, id: out?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
