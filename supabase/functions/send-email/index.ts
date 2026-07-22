// Send transactional emails via Resend.
// Body: { type: 'welcome' | 'transfer_completed' | 'kyc_update' | 'kyb_update' | 'topup_completed', to: string, data?: Record<string, any> }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "eFinMoney <noreply@efinsuite.com>";

function welcomeHtml(name: string, accountNumber?: string, efinTag?: string | null, appUrl?: string) {
  const tagUrl = `${appUrl || "https://efin.money"}/profile`;
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

function paymentLinkHtml(d: Record<string, any>) {
  const amount = `${d.currency || ""} ${Number(d.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  const sender = d.sender_name || "Someone";
  const expires = d.expires_at ? new Date(d.expires_at).toLocaleDateString() : null;
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 8px">${sender} sent you money 💸</h1>
      <p style="line-height:1.55;margin:0 0 20px">You've been sent a payment via eFinMoney. Click below to choose how you'd like to receive it — your bank, Interac, or your debit card.</p>
      <div style="margin:0 0 20px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
        <p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Amount</p>
        <p style="margin:0;font-size:28px;font-weight:700">${amount}</p>
        ${d.note ? `<p style="margin:12px 0 0;color:#475569;font-style:italic">"${d.note}"</p>` : ""}
      </div>
      <a href="${d.claim_url}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:600;font-size:15px">
        Receive ${amount}
      </a>
      <p style="line-height:1.55;color:#64748b;font-size:12px;margin-top:20px">
        Or paste this link into your browser:<br>
        <a href="${d.claim_url}" style="color:#10b981;word-break:break-all">${d.claim_url}</a>
      </p>
      ${expires ? `<p style="color:#64748b;font-size:12px;margin-top:12px">This link expires on ${expires} and can only be claimed once.</p>` : ""}
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">If you weren't expecting this, you can safely ignore this email. eFinMoney protects payment links with encryption and fraud monitoring.</p>
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

function kybHtml(d: Record<string, any>) {
  const name = d.legal_name || "your business";
  const status = String(d.status || "updated");
  const appUrl = d.app_url || "https://efin.money";

  const body: Record<string, string> = {
    approved: `<p style="line-height:1.55"><strong>${name}</strong> has been verified. Your business account is active and ready to send and receive payments.</p>`,
    rejected: `<p style="line-height:1.55">We were unable to verify <strong>${name}</strong>.</p>
      ${d.reason ? `<div style="margin:20px 0;padding:16px;border-left:3px solid #ef4444;background:#fef2f2"><p style="margin:0;line-height:1.55">${d.reason}</p></div>` : ""}
      <p style="line-height:1.55">You can update your details and resubmit — everything you entered has been saved.</p>`,
    suspended: `<p style="line-height:1.55">The business account for <strong>${name}</strong> has been suspended.</p>
      ${d.reason ? `<div style="margin:20px 0;padding:16px;border-left:3px solid #ef4444;background:#fef2f2"><p style="margin:0;line-height:1.55">${d.reason}</p></div>` : ""}
      <p style="line-height:1.55">Please contact support to discuss reinstating it.</p>`,
    pending_review: `<p style="line-height:1.55">We have received the verification application for <strong>${name}</strong>.</p>
      <p style="line-height:1.55">Our compliance team reviews applications within 1–2 business days. We will email you as soon as there is a decision.</p>`,
  };

  const headings: Record<string, string> = {
    approved: "Business verified ✅",
    rejected: "Business verification unsuccessful",
    suspended: "Business account suspended",
    pending_review: "Application received",
  };

  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 12px">${headings[status] || "Business verification update"}</h1>
      ${body[status] || `<p style="line-height:1.55">The verification status for <strong>${name}</strong> is now: <strong>${status}</strong>.</p>`}
      <p style="margin-top:24px"><a href="${appUrl}/dashboard" style="color:#2563eb">Open your dashboard</a></p>
      <p style="color:#64748b;font-size:12px;margin-top:32px">— eFinMoney Compliance</p>
    </div>`;
}

function topupCompletedHtml(d: Record<string, any>) {
  const currency = d.currency || "";
  const amount = Number(d.amount || 0);
  const sym = { CAD: "C$", USD: "$", EUR: "€", GBP: "£", NGN: "₦", GHS: "GH₵" }[currency] || currency;
  const amt = currency === "NGN" ? amount.toLocaleString() : amount.toFixed(2);
  const appUrl = d.app_url || "https://efin.money";
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 12px">Wallet Topped Up ✅</h1>
      <p style="line-height:1.55">Your wallet has been credited successfully.</p>
      <div style="margin:20px 0;padding:20px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4">
        <p style="margin:0 0 6px;color:#065f46;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Amount credited</p>
        <p style="margin:0;font-size:26px;font-weight:700;color:#065f46">${sym}${amt} ${currency}</p>
        ${d.reference ? `<p style="margin:8px 0 0;color:#047857;font-size:12px;font-family:monospace">Ref: ${d.reference}</p>` : ""}
      </div>
      <a href="${appUrl}/wallets" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:9999px;font-weight:600;font-size:14px">
        View wallet
      </a>
      <p style="color:#64748b;font-size:12px;margin-top:32px">— The eFinMoney Team</p>
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
    } else if (type === "payment_link") {
      const amt = `${data.currency || ""} ${Number(data.amount || 0).toFixed(2)}`.trim();
      subject = `${data.sender_name || "Someone"} sent you ${amt}`;
      html = paymentLinkHtml(data);
    } else if (type === "kyc_update") {
      subject = `KYC status updated: ${data.status}`;
      html = kycHtml(data.status || "updated");
    } else if (type === "kyb_update") {
      const subjects: Record<string, string> = {
        approved: `${data.legal_name || "Your business"} is verified`,
        rejected: `Action needed: ${data.legal_name || "your business"} verification`,
        suspended: `${data.legal_name || "Your business"} account suspended`,
        pending_review: `We received your application for ${data.legal_name || "your business"}`,
      };
      subject = subjects[String(data.status)] || `Business verification updated: ${data.status}`;
      html = kybHtml(data);
    } else if (type === "topup_completed") {
      const sym = { CAD: "C$", USD: "$", EUR: "€", GBP: "£", NGN: "₦", GHS: "GH₵" }[data.currency] || "";
      const amt = data.currency === "NGN" ? Number(data.amount || 0).toLocaleString() : Number(data.amount || 0).toFixed(2);
      subject = `Wallet topped up — ${sym}${amt} ${data.currency || ""}`;
      html = topupCompletedHtml(data);
    } else {
      return new Response(JSON.stringify({ error: "unknown email type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cc = type === "topup_completed" ? ["support@efin.money"] : undefined;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM, to: [to], cc, subject, html }),
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
