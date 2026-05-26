// Send transactional emails via Resend.
// Body: { type: 'welcome' | 'transfer_completed' | 'kyc_update', to: string, data?: Record<string, any> }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "eFinMoney <noreply@efinsuite.com>";

function welcomeHtml(name: string, accountNumber?: string, efinTag?: string | null, appUrl?: string) {
  const tagUrl = `${appUrl || "https://efin.money"}/settings/profile`;
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:24px;margin:0 0 12px">Welcome to eFinMoney${name ? ", " + name : ""} 👋</h1>
      <p style="line-height:1.55">Your account is ready. Send money across borders, hold multi-currency wallets, and track everything in one place.</p>

      ${accountNumber ? `
      <div style="margin:24px 0;padding:20px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
        <p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Your eFinMoney account number</p>
        <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:0.05em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${accountNumber}</p>
      </div>` : ""}

      ${!efinTag ? `
      <div style="margin:24px 0;padding:20px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4">
        <h2 style="margin:0 0 8px;font-size:16px;color:#065f46">Claim your @efin tag</h2>
        <p style="margin:0 0 14px;line-height:1.55;color:#0f172a;font-size:14px">
          An @efin tag lets anyone send you money instantly using a memorable handle instead of your account number.
        </p>
        <a href="${tagUrl}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:9999px;font-weight:600;font-size:14px">
          Create my @efin tag
        </a>
      </div>` : `
      <p style="line-height:1.55">Your tag: <strong>@${efinTag}</strong></p>`}

      <p style="line-height:1.55">Next steps: complete KYC to unlock higher transaction limits.</p>
      <p style="color:#64748b;font-size:12px;margin-top:32px">— The eFinMoney Team</p>
    </div>`;
}

function transferReceiptHtml(d: Record<string, any>) {
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 12px">Transfer Completed ✅</h1>
      <p style="line-height:1.55">Your transfer has been delivered successfully.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 0;color:#64748b">Recipient</td><td style="text-align:right"><strong>${d.recipient_name || "—"}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Amount</td><td style="text-align:right"><strong>${d.source_amount} ${d.source_currency}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Reference</td><td style="text-align:right;font-family:monospace">${d.reference || d.id}</td></tr>
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:32px">eFinMoney — Cross-border payments</p>
    </div>`;
}

function kycHtml(status: string) {
  const pretty = status.charAt(0).toUpperCase() + status.slice(1);
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 12px">KYC Status Update</h1>
      <p style="line-height:1.55">Your KYC verification status is now: <strong>${pretty}</strong>.</p>
      <p style="line-height:1.55">Sign in to your dashboard to view details and unlock additional features.</p>
      <p style="color:#64748b;font-size:12px;margin-top:32px">— eFinMoney Compliance</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, to, data = {} } = await req.json();
    if (!type || !to) {
      return new Response(JSON.stringify({ error: "type and to are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subject = "";
    let html = "";
    if (type === "welcome") {
      subject = "Welcome to eFinMoney";
      html = welcomeHtml(data.name || "", data.account_number, data.efin_tag, data.app_url);
    } else if (type === "transfer_completed") {
      subject = `Transfer to ${data.recipient_name || "recipient"} completed`;
      html = transferReceiptHtml(data);
    } else if (type === "kyc_update") {
      subject = `KYC status updated: ${data.status}`;
      html = kycHtml(data.status || "updated");
    } else {
      return new Response(JSON.stringify({ error: "unknown email type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });

    const body = await res.json();
    if (!res.ok) {
      console.error("Resend error:", body);
      return new Response(JSON.stringify({ error: body }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: body.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
