// Send transactional emails via Resend.
// Body: { type: 'welcome' | 'transfer_completed' | 'kyc_update' | 'kyb_update' | 'topup_completed' | 'payment_link', to: string, data?: Record<string, any> }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "eFinMoney <noreply@efinsuite.com>";

/** Strip tags so the CRM timeline shows readable text rather than raw HTML. */
function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

/** Best-effort CRM log of an outbound email — never blocks or fails the send. */
async function logCommunication(args: {
  to: string;
  subject: string;
  html: string;
  type: string;
  status: "sent" | "failed";
  metadata: Record<string, unknown>;
}) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };

    const profileRes = await fetch(
      `${url}/rest/v1/profiles?select=user_id&email=eq.${encodeURIComponent(args.to)}&limit=1`,
      { headers },
    );
    const profiles = profileRes.ok ? await profileRes.json() : [];
    const userId = Array.isArray(profiles) && profiles[0]?.user_id ? profiles[0].user_id : null;

    await fetch(`${url}/rest/v1/customer_communications`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        channel: "email",
        direction: "outbound",
        subject: args.subject,
        content: htmlToText(args.html),
        template_id: args.type,
        status: args.status,
        sent_at: new Date().toISOString(),
        metadata: { ...args.metadata, recipient: args.to },
      }),
    });
  } catch (e) {
    console.error("communication log failed (non-blocking):", e);
  }
}

// ────────────────────────────────────────────────────────────────────
// Branded email layout
// ────────────────────────────────────────────────────────────────────
//
// Wraps the per-type body in a consistent eFinMoney shell: deep-navy
// header with the logo, white card with the content, and a deep-navy
// footer with the support line + copyright. All colours are inline
// because most email clients (Gmail, Outlook, Apple Mail) strip CSS
// variables and <style> blocks.
//
//   brand-900  ≈ #160c3a  (deep navy / header + footer)
//   brand-500  ≈ #6d4ee0  (mid purple, used for links)
//   accent-amber ≈ #fdb913 (gold, used for the wordmark accent)
//
// logoUrl is parameterised so the same template works in dev
// (localhost) and prod (efin.money).
function emailLayout(opts: {
  preheader?: string;
  bodyHtml: string;
  logoUrl: string;
  appUrl: string;
  supportEmail?: string;
}) {
  const { preheader = "", bodyHtml, logoUrl, appUrl, supportEmail = "support@efin.money" } = opts;
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>eFinMoney</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;-webkit-text-size-adjust:100%">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,0.08)">
          <!-- Brand header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0e0a26 0%,#1a1140 50%,#241659 100%);padding:28px 24px;text-align:center">
              <a href="${appUrl}" style="text-decoration:none;display:inline-block">
                <img src="${logoUrl}" alt="eFinMoney" width="180" style="display:block;margin:0 auto;max-width:180px;height:auto;border:0">
              </a>
            </td>
          </tr>
          <!-- Accent strip -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#fdb913 0%,#f59e0b 50%,#fdb913 100%);font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:36px 28px;font-size:16px;line-height:1.6;color:#0f172a">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#0e0a26;padding:24px 28px;text-align:center">
              <p style="margin:0 0 6px;font-family:'Space Grotesk','Inter',sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;background:linear-gradient(110deg,#fbbf24 0%,#f59e0b 50%,#fbbf24 100%);-webkit-background-clip:text;background-clip:text;color:transparent">eFinMoney</p>
              <p style="margin:0 0 12px;color:#cbd5e1;font-size:13px;line-height:1.5">Cross-border payments · Multi-currency wallets · Cards &amp; FX</p>
              <p style="margin:0;color:#94a3b8;font-size:12px">
                Need help? <a href="mailto:${supportEmail}" style="color:#fbbf24;text-decoration:none">${supportEmail}</a>
              </p>
              <p style="margin:8px 0 0;color:#64748b;font-size:11px">
                <a href="${appUrl}" style="color:#cbd5e1;text-decoration:underline">${appUrl.replace(/^https?:\/\//, "")}</a> &nbsp;·&nbsp; © ${year} eFinMoney. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Returns the public logo + app URL for the environment. */
function brandUrls() {
  const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://efin.money";
  // In dev, public/ files are served by Vite at the same origin; in prod
  // they're served by the static host at PUBLIC_APP_URL.
  const logoUrl = `${appUrl.replace(/\/$/, "")}/email-logo.png`;
  return { appUrl, logoUrl };
}

// ────────────────────────────────────────────────────────────────────
// Per-type email bodies (return ONLY the inner HTML; layout wraps it)
// ────────────────────────────────────────────────────────────────────

function welcomeBody(name: string, accountNumber?: string, efinTag?: string | null, appUrl = "https://efin.money") {
  const tagUrl = `${appUrl}/profile`;
  return `
    <h1 style="margin:0 0 12px;font-family:'Space Grotesk','Inter',sans-serif;font-size:26px;font-weight:700;color:#0f172a;letter-spacing:-0.02em">Welcome to eFinMoney${name ? ", " + name : ""} 👋</h1>
    <p style="margin:0 0 18px;line-height:1.6;color:#334155">Your account is ready. Send money across borders, hold multi-currency wallets, and track everything in one place.</p>

    ${accountNumber ? `
    <div style="margin:24px 0;padding:20px 22px;border:1px solid #e2e8f0;border-radius:12px;background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%)">
      <p style="margin:0 0 6px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Your eFinMoney account number</p>
      <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:0.05em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#0f172a">${accountNumber}</p>
    </div>` : ""}

    ${!efinTag ? `
    <div style="margin:24px 0;padding:20px 22px;border:1px solid #bbf7d0;border-radius:12px;background:linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%)">
      <h2 style="margin:0 0 8px;font-family:'Space Grotesk','Inter',sans-serif;font-size:17px;font-weight:700;color:#065f46">Claim your @efin tag</h2>
      <p style="margin:0 0 14px;line-height:1.55;color:#334155;font-size:14px">
        An @efin tag lets anyone send you money instantly using a memorable handle instead of your account number.
      </p>
      <a href="${tagUrl}" style="display:inline-block;background:linear-gradient(135deg,#fdb913 0%,#f59e0b 100%);color:#0e0a26;text-decoration:none;padding:12px 22px;border-radius:9999px;font-weight:700;font-size:14px;box-shadow:0 6px 16px -4px rgba(245,158,11,0.45)">
        Create my @efin tag →
      </a>
    </div>` : `
    <p style="line-height:1.55;color:#334155">Your tag: <strong style="color:#0f172a">@${efinTag}</strong></p>`}

    <p style="margin:18px 0 0;line-height:1.6;color:#334155">Next step: complete KYC to unlock higher transaction limits.</p>
  `;
}

function transferReceiptBody(d: Record<string, any>) {
  return `
    <h1 style="margin:0 0 12px;font-family:'Space Grotesk','Inter',sans-serif;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em">Transfer completed ✅</h1>
    <p style="margin:0 0 20px;line-height:1.6;color:#334155">Your transfer has been delivered successfully.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <tr>
        <td style="padding:12px 16px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:40%">Recipient</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a">${d.recipient_name || "—"}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;background:#f8fafc;border-bottom:1px solid #e2e8f0">Amount</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a">${d.source_amount} ${d.source_currency}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;background:#f8fafc">Reference</td>
        <td style="padding:12px 16px;font-family:ui-monospace,monospace;color:#0f172a;font-size:13px">${d.reference || d.id || ""}</td>
      </tr>
    </table>
  `;
}

function paymentLinkBody(d: Record<string, any>, appUrl: string) {
  const amount = `${d.currency || ""} ${Number(d.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
  const sender = d.sender_name || "Someone";
  const expires = d.expires_at ? new Date(d.expires_at).toLocaleDateString() : null;
  return `
    <h1 style="margin:0 0 8px;font-family:'Space Grotesk','Inter',sans-serif;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em">${sender} sent you money 💸</h1>
    <p style="margin:0 0 20px;line-height:1.6;color:#334155">You've been sent a payment via eFinMoney. Click below to choose how you'd like to receive it — your bank, Interac, or your debit card.</p>
    <div style="margin:0 0 20px;padding:22px;border:1px solid #e2e8f0;border-radius:12px;background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%)">
      <p style="margin:0 0 6px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Amount</p>
      <p style="margin:0;font-family:'Space Grotesk','Inter',sans-serif;font-size:30px;font-weight:700;color:#0f172a;letter-spacing:-0.02em">${amount}</p>
      ${d.note ? `<p style="margin:12px 0 0;color:#475569;font-style:italic">"${d.note}"</p>` : ""}
    </div>
    <a href="${d.claim_url}" style="display:inline-block;background:linear-gradient(135deg,#fdb913 0%,#f59e0b 100%);color:#0e0a26;text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:700;font-size:15px;box-shadow:0 8px 20px -6px rgba(245,158,11,0.5)">
      Receive ${amount} →
    </a>
    <p style="line-height:1.6;color:#64748b;font-size:12px;margin-top:20px">
      Or paste this link into your browser:<br>
      <a href="${d.claim_url}" style="color:#6d4ee0;word-break:break-all">${d.claim_url}</a>
    </p>
    ${expires ? `<p style="color:#64748b;font-size:12px;margin-top:12px">This link expires on ${expires} and can only be claimed once.</p>` : ""}
    <p style="color:#94a3b8;font-size:11px;margin-top:24px">If you weren't expecting this, you can safely ignore this email. eFinMoney protects payment links with encryption and fraud monitoring.</p>
  `;
}

function kycBody(status: string, d: Record<string, any> = {}) {
  const name = d.name ? `, ${d.name}` : "";
  if (status === "approved") {
    const isTier3 = d.scope === "id_and_address";
    const tier = isTier3 ? "Tier 3" : "Tier 2";
    const limits = isTier3
      ? "up to $50,000/day and $500,000/month, including international transfers and virtual cards"
      : "up to $5,000/day and $50,000/month";
    return `
      <div style="text-align:center;margin:0 0 18px">
        <div style="display:inline-block;width:64px;height:64px;line-height:64px;border-radius:50%;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff;font-size:32px;box-shadow:0 8px 20px -6px rgba(16,185,129,0.5)">✓</div>
      </div>
      <h1 style="margin:0 0 8px;font-family:'Space Grotesk','Inter',sans-serif;font-size:26px;font-weight:700;color:#0f172a;text-align:center;letter-spacing:-0.02em">Identity verified</h1>
      <p style="margin:0 0 22px;line-height:1.6;color:#334155;text-align:center">Great news${name}! Your identity verification has been approved.</p>
      <div style="margin:0 0 20px;padding:22px;border:1px solid #bbf7d0;border-radius:12px;background:linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%);text-align:center">
        <p style="margin:0 0 4px;color:#065f46;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Account level</p>
        <p style="margin:0;font-family:'Space Grotesk','Inter',sans-serif;font-size:22px;font-weight:700;color:#065f46;letter-spacing:-0.01em">${tier} — Verified</p>
        <p style="margin:10px 0 0;color:#047857;font-size:13px;line-height:1.5">You can now send ${limits}.</p>
      </div>
      <p style="margin:0;line-height:1.6;color:#334155;text-align:center">Sign in to your dashboard to start sending money.</p>
    `;
  }
  const pretty = status.charAt(0).toUpperCase() + status.slice(1);
  const tone = status === "rejected" ? "danger" : "neutral";
  const stripe = tone === "danger" ? "#ef4444" : "#fdb913";
  const bg = tone === "danger" ? "linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%)" : "linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)";
  const titleColor = tone === "danger" ? "#991b1b" : "#92400e";
  return `
    <h1 style="margin:0 0 12px;font-family:'Space Grotesk','Inter',sans-serif;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em">KYC status update</h1>
    <p style="margin:0 0 18px;line-height:1.6;color:#334155">Hi${name}, here's the latest on your identity verification.</p>
    <div style="margin:0 0 20px;padding:18px 20px;border-left:4px solid ${stripe};border-radius:0 8px 8px 0;background:${bg}">
      <p style="margin:0;color:${titleColor};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">New status</p>
      <p style="margin:6px 0 0;font-family:'Space Grotesk','Inter',sans-serif;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.01em">${pretty}</p>
    </div>
    <p style="margin:0;line-height:1.6;color:#334155">Sign in to your dashboard to view details and unlock additional features.</p>
  `;
}

function kybBody(d: Record<string, any>, appUrl: string) {
  const name = d.legal_name || "your business";
  const status = String(d.status || "updated");

  const body: Record<string, string> = {
    approved: `<p style="line-height:1.6;margin:0 0 16px;color:#334155"><strong style="color:#0f172a">${name}</strong> has been verified. Your business account is active and ready to send and receive payments.</p>`,
    rejected: `<p style="line-height:1.6;margin:0 0 16px;color:#334155">We were unable to verify <strong style="color:#0f172a">${name}</strong>.</p>
      ${d.reason ? `<div style="margin:0 0 16px;padding:14px 16px;border-left:3px solid #ef4444;background:#fef2f2;border-radius:0 8px 8px 0"><p style="margin:0;line-height:1.6;color:#7f1d1d">${d.reason}</p></div>` : ""}
      <p style="line-height:1.6;margin:0;color:#334155">You can update your details and resubmit — everything you entered has been saved.</p>`,
    suspended: `<p style="line-height:1.6;margin:0 0 16px;color:#334155">The business account for <strong style="color:#0f172a">${name}</strong> has been suspended.</p>
      ${d.reason ? `<div style="margin:0 0 16px;padding:14px 16px;border-left:3px solid #ef4444;background:#fef2f2;border-radius:0 8px 8px 0"><p style="margin:0;line-height:1.6;color:#7f1d1d">${d.reason}</p></div>` : ""}
      <p style="line-height:1.6;margin:0;color:#334155">Please contact support to discuss reinstating it.</p>`,
    pending_review: `<p style="line-height:1.6;margin:0 0 16px;color:#334155">We have received the verification application for <strong style="color:#0f172a">${name}</strong>.</p>
      <p style="line-height:1.6;margin:0;color:#334155">Our compliance team reviews applications within 1–2 business days. We will email you as soon as there is a decision.</p>`,
  };

  const headings: Record<string, string> = {
    approved: "Business verified ✅",
    rejected: "Business verification unsuccessful",
    suspended: "Business account suspended",
    pending_review: "Application received",
  };

  return `
    <h1 style="margin:0 0 12px;font-family:'Space Grotesk','Inter',sans-serif;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em">${headings[status] || "Business verification update"}</h1>
    ${body[status] || `<p style="line-height:1.6;margin:0;color:#334155">The verification status for <strong style="color:#0f172a">${name}</strong> is now: <strong>${status}</strong>.</p>`}
    <div style="text-align:center;margin-top:24px">
      <a href="${appUrl}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#fdb913 0%,#f59e0b 100%);color:#0e0a26;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:700;font-size:14px;box-shadow:0 8px 20px -6px rgba(245,158,11,0.5)">
        Open dashboard →
      </a>
    </div>
  `;
}

function topupCompletedBody(d: Record<string, any>, appUrl: string) {
  const currency = d.currency || "";
  const amount = Number(d.amount || 0);
  const sym = { CAD: "C$", USD: "$", EUR: "€", GBP: "£", NGN: "₦", GHS: "GH₵" }[currency] || currency;
  const amt = currency === "NGN" ? amount.toLocaleString() : amount.toFixed(2);
  return `
    <h1 style="margin:0 0 12px;font-family:'Space Grotesk','Inter',sans-serif;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em">Wallet topped up ✅</h1>
    <p style="margin:0 0 20px;line-height:1.6;color:#334155">Your wallet has been credited successfully.</p>
    <div style="margin:0 0 20px;padding:22px;border:1px solid #bbf7d0;border-radius:12px;background:linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%);text-align:center">
      <p style="margin:0 0 6px;color:#065f46;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Amount credited</p>
      <p style="margin:0;font-family:'Space Grotesk','Inter',sans-serif;font-size:32px;font-weight:700;color:#065f46;letter-spacing:-0.02em">${sym}${amt} ${currency}</p>
      ${d.reference ? `<p style="margin:8px 0 0;color:#047857;font-size:12px;font-family:ui-monospace,monospace">Ref: ${d.reference}</p>` : ""}
    </div>
    <div style="text-align:center">
      <a href="${appUrl}/wallets" style="display:inline-block;background:linear-gradient(135deg,#fdb913 0%,#f59e0b 100%);color:#0e0a26;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:700;font-size:14px;box-shadow:0 8px 20px -6px rgba(245,158,11,0.5)">
        View wallet →
      </a>
    </div>
  `;
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

    const { appUrl, logoUrl } = brandUrls();

    let subject = "";
    let bodyHtml = "";
    let preheader = "";
    if (type === "welcome") {
      subject = "Welcome to eFinMoney";
      preheader = "Your account is ready. Send money across borders, hold multi-currency wallets.";
      bodyHtml = welcomeBody(data.name || "", data.account_number, data.efin_tag, appUrl);
    } else if (type === "transfer_completed") {
      subject = `Transfer to ${data.recipient_name || "recipient"} completed`;
      preheader = `${data.source_amount} ${data.source_currency} sent.`;
      bodyHtml = transferReceiptBody(data);
    } else if (type === "payment_link") {
      const amt = `${data.currency || ""} ${Number(data.amount || 0).toFixed(2)}`.trim();
      subject = `${data.sender_name || "Someone"} sent you ${amt}`;
      preheader = `You have money waiting — claim within the link expiry.`;
      bodyHtml = paymentLinkBody(data, appUrl);
    } else if (type === "kyc_update") {
      subject = data.status === "approved"
        ? "Your identity has been verified — eFinMoney"
        : `KYC status update: ${data.status}`;
      preheader = data.status === "approved"
        ? "Identity verified — your limits have been raised."
        : `Your KYC status is now: ${data.status}.`;
      bodyHtml = kycBody(data.status || "updated", data);
    } else if (type === "kyb_update") {
      const subjects: Record<string, string> = {
        approved: `${data.legal_name || "Your business"} is verified`,
        rejected: `Action needed: ${data.legal_name || "your business"} verification`,
        suspended: `${data.legal_name || "Your business"} account suspended`,
        pending_review: `We received your application for ${data.legal_name || "your business"}`,
      };
      subject = subjects[String(data.status)] || `Business verification updated: ${data.status}`;
      preheader = `${data.legal_name || "Your business"} verification update.`;
      bodyHtml = kybBody(data, appUrl);
    } else if (type === "topup_completed") {
      const sym = { CAD: "C$", USD: "$", EUR: "€", GBP: "£", NGN: "₦", GHS: "GH₵" }[data.currency] || "";
      const amt = data.currency === "NGN" ? Number(data.amount || 0).toLocaleString() : Number(data.amount || 0).toFixed(2);
      subject = `Wallet topped up — ${sym}${amt} ${data.currency || ""}`;
      preheader = `${sym}${amt} ${data.currency || ""} credited to your wallet.`;
      bodyHtml = topupCompletedBody(data, appUrl);
    } else {
      return new Response(JSON.stringify({ error: "unknown email type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = emailLayout({ preheader, bodyHtml, logoUrl, appUrl });
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
      await logCommunication({ to, subject, html, type, status: "failed", metadata: { error: body } });
      return new Response(JSON.stringify({ error: body }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logCommunication({ to, subject, html, type, status: "sent", metadata: { provider: "resend", message_id: body.id, cc } });

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
