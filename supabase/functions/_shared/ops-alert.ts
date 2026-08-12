/**
 * Ops alert email — plain-English briefs for non-dev admins.
 * Default recipient: ukwenzyb@gmail.com (override via OPS_ALERT_EMAIL).
 */
const DEFAULT_OPS_EMAIL = "ukwenzyb@gmail.com";
const FROM = "eFinMoney Ops <noreply@efinsuite.com>";
const OPS_QUEUE_URL = "https://www.efin.money/admin/ops-queue";

const PARTNER_NAMES: Record<string, string> = {
  fincra: "Fincra",
  nomba: "Nomba",
  flovide: "Flovide",
  flutterwave: "Flutterwave",
  flw: "Flutterwave",
  lenhub: "Lenhub",
  lenhub_flutter: "Lenhub",
  paytota: "Paytota",
  swychr: "Swychr",
  ghana_pay: "Ghana Pay",
  ghana: "Ghana Pay",
  elicate: "Elicate",
  interac: "Interac",
  stub: "(no provider)",
  unknown: "(unknown)",
};

export function partnerDisplayName(code: string): string {
  const k = code.trim().toLowerCase();
  return PARTNER_NAMES[k] || code;
}

export function partnersSentence(codes: string[]): string {
  const names = codes.map(partnerDisplayName).filter(Boolean);
  if (!names.length) return "no payment company";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, then ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, then ${names[names.length - 1]}`;
}

/** Turn provider jargon into something an ops person can act on. */
export function explainPayoutError(raw: string): { plain: string; tip: string } {
  const e = String(raw || "").trim();
  const lower = e.toLowerCase();

  if (!e) {
    return {
      plain: "The payment companies we tried could not finish sending this money.",
      tip: "Open the ops queue, retry with another provider, or refund the customer if you cannot pay them another way.",
    };
  }
  if (lower.includes("quote http 404") || lower.includes("quote") && lower.includes("404")) {
    return {
      plain: "Fincra could not create a payout quote for this corridor (their system returned “not found”). Often that means this currency route is not enabled on the Fincra business account, or the funding wallet they tried does not support it.",
      tip: "Retry with Flovide or Nomba from the ops queue. If those also fail, pay the recipient outside the app and tap “Mark completed”, or refund the customer wallet.",
    };
  }
  if (lower.includes("404") || lower.includes("not found") || lower.includes("corridor")) {
    return {
      plain: "The payment company said this bank account or payout route was not found / not supported.",
      tip: "Confirm the bank and 10-digit account number with the customer, then retry. If the details are wrong, refund and ask them to resend.",
    };
  }
  if (lower.includes("no flovide") && lower.includes("balance")) {
    return {
      plain: "Flovide does not have enough naira (or the right currency wallet) to pay this out.",
      tip: "Top up the Flovide NGN balance, then retry Flovide from the ops queue — or retry with Nomba.",
    };
  }
  if (lower.includes("not on flovide") || lower.includes("bank list")) {
    return {
      plain: "The selected bank is not recognised on Flovide’s Nigeria bank list (wrong bank or outdated code).",
      tip: "Ask the customer to re-select the bank in the app (e.g. OPay vs PalmPay), then retry — or refund.",
    };
  }
  if (lower.includes("insufficient") || lower.includes("balance") || lower.includes("liquidity") || lower.includes("float")) {
    return {
      plain: "A payment company did not have enough float/balance to pay this out.",
      tip: "Top up that provider’s wallet, then retry from the ops queue — or use another provider.",
    };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("network")) {
    return {
      plain: "The payment company did not respond in time (timeout / network).",
      tip: "Wait a minute and retry the same provider. Check their dashboard in case the payout actually went through before marking completed.",
    };
  }
  if (lower.includes("not configured") || lower.includes("missing")) {
    return {
      plain: "A required payment provider is not fully set up (API keys / config missing).",
      tip: "Ask engineering to check provider secrets, or retry with a different company that is live.",
    };
  }
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) {
    return {
      plain: "The payment company rejected our login / API credentials.",
      tip: "Ask engineering to refresh that provider’s API keys, then retry.",
    };
  }

  return {
    plain: e.length > 180 ? `${e.slice(0, 177)}…` : e,
    tip: "Open the ops queue → pick this transfer → Retry with another provider, Mark completed if you paid manually, or Refund wallet.",
  };
}

export async function notifyOpsFailoverPing(params: {
  amount: string;
  recipient: string;
  failedRail: string;
  failedWhy: string;
  workedRail: string;
  tip: string;
  transferId: string;
}): Promise<{ sent: boolean; error?: string }> {
  const failed = partnerDisplayName(params.failedRail);
  const worked = partnerDisplayName(params.workedRail);
  const why = explainPayoutError(params.failedWhy);

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222;max-width:480px;line-height:1.4;">
      <div style="background:#0f766e;padding:14px 18px;border-radius:8px 8px 0 0;">
        <span style="color:#fff;font-weight:700;">eFinMoney Ops</span>
      </div>
      <div style="border:1px solid #e0e0e0;border-top:none;padding:16px 18px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 10px;font-weight:700;color:#0f766e;">Payout OK — but a preferred rail failed</p>
        <p style="margin:0 0 8px;"><strong>Failed:</strong> ${escapeHtml(failed)} — ${escapeHtml(why.plain.slice(0, 140))}</p>
        <p style="margin:0 0 8px;"><strong>Fix:</strong> ${escapeHtml((params.tip || why.tip).slice(0, 120))}</p>
        <p style="margin:0 0 8px;"><strong>Worked:</strong> ${escapeHtml(worked)} paid ${escapeHtml(params.amount)} to ${escapeHtml(params.recipient || "recipient")}.</p>
        <p style="margin:0;font-size:12px;color:#888;">${escapeHtml(params.transferId.slice(0, 8))}… · no action needed unless you want to restore ${escapeHtml(failed)}</p>
      </div>
    </div>`;

  return sendOpsEmail(
    `[FYI] ${failed} failed → ${worked} paid ${params.amount}`,
    html,
  );
}


export type OpsBrief = {
  /** Short subject line */
  subject: string;
  /** What happened to the customer money right now */
  moneyStatus: "held" | "refunded";
  amount: string;
  recipient: string;
  corridor: string;
  country?: string;
  transferId: string;
  providersTried: string[];
  policyPreferred?: string;
  policyBackups?: string[];
  rawError: string;
  accountHint?: string;
};

export async function notifyOpsBrief(brief: OpsBrief): Promise<{ sent: boolean; error?: string }> {
  const explained = explainPayoutError(brief.rawError);
  const tried = partnersSentence(brief.providersTried);
  const preferred = brief.policyPreferred ? partnerDisplayName(brief.policyPreferred) : null;
  const backups = (brief.policyBackups || []).map(partnerDisplayName).filter(Boolean);

  const moneyLine = brief.moneyStatus === "held"
    ? "The customer’s money is still with us (held). It has NOT been refunded yet — please finish delivery or refund them."
    : "The customer’s wallet was already refunded. No money is waiting in the hold queue for this transfer.";

  const whatLine = brief.moneyStatus === "held"
    ? `We could not automatically pay ${brief.recipient || "the recipient"} (${brief.amount} via ${brief.corridor}${brief.country ? `, ${brief.country}` : ""}).`
    : `We could not pay ${brief.recipient || "the recipient"} (${brief.amount}). Funds were returned to their wallet.`;

  const planLine = preferred
    ? `Today’s rule was: try ${preferred} first${backups.length ? `, then ${backups.join(", ")}` : " only"}.`
    : "No special corridor rule was set — we used the default provider order.";

  const steps = brief.moneyStatus === "held"
    ? [
      "Open the Ops queue (button below).",
      "Select this transfer.",
      "Retry with another payment company (e.g. Nomba if Flovide/Fincra failed).",
      "If you already paid the person outside the app, tap “Mark completed”.",
      "If you cannot pay them, tap “Refund wallet” so the customer gets their money back.",
    ]
    : [
      "No hold action needed — money is already back with the customer.",
      "If they still need the payout, ask them to send again after fixing bank details or provider float.",
    ];

  const stepsHtml = steps.map((s, i) =>
    `<li style="margin:0 0 6px;">${escapeHtml(s)}</li>`
  ).join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222;max-width:560px;line-height:1.45;">
      <div style="background:#b45309;padding:20px 24px;border-radius:8px 8px 0 0;">
        <span style="color:#fff;font-weight:700;font-size:16px;">eFinMoney Ops</span>
      </div>
      <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <h2 style="margin:0 0 8px;font-size:18px;color:#92400e;">
          ${brief.moneyStatus === "held" ? "Action needed: payout on hold" : "Payout failed (customer refunded)"}
        </h2>
        <p style="margin:0 0 16px;color:#444;">${escapeHtml(whatLine)}</p>

        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9a3412;margin-bottom:6px;">Money status</div>
          <p style="margin:0;color:#7c2d12;">${escapeHtml(moneyLine)}</p>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#666;margin-bottom:6px;">What we already tried</div>
          <p style="margin:0 0 6px;">Tried: <strong>${escapeHtml(tried)}</strong></p>
          <p style="margin:0;color:#555;font-size:14px;">${escapeHtml(planLine)}</p>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#666;margin-bottom:6px;">Why it failed (plain English)</div>
          <p style="margin:0 0 8px;">${escapeHtml(explained.plain)}</p>
          <p style="margin:0;color:#555;font-size:14px;"><strong>What you should do:</strong> ${escapeHtml(explained.tip)}</p>
        </div>

        <div style="margin-bottom:20px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#666;margin-bottom:6px;">Step-by-step</div>
          <ol style="margin:0;padding-left:20px;">${stepsHtml}</ol>
        </div>

        <table style="border-collapse:collapse;font-size:13px;margin-bottom:20px;width:100%;color:#555;">
          <tr><td style="padding:3px 12px 3px 0;">Transfer</td><td style="padding:3px 0;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(brief.transferId)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;">Amount</td><td style="padding:3px 0;font-weight:600;">${escapeHtml(brief.amount)}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;">Recipient</td><td style="padding:3px 0;font-weight:600;">${escapeHtml(brief.recipient || "—")}</td></tr>
          ${brief.accountHint ? `<tr><td style="padding:3px 12px 3px 0;">Account</td><td style="padding:3px 0;">${escapeHtml(brief.accountHint)}</td></tr>` : ""}
          <tr><td style="padding:3px 12px 3px 0;">Technical note</td><td style="padding:3px 0;font-size:12px;color:#888;">${escapeHtml(brief.rawError || "—")}</td></tr>
        </table>

        <a href="${escapeHtml(OPS_QUEUE_URL)}" style="display:inline-block;background:#1a237e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600;">Open ops queue</a>
      </div>
    </div>`;

  return sendOpsEmail(brief.subject, html);
}

/** @deprecated Prefer notifyOpsBrief for payout holds — kept for simple one-off alerts. */
export async function notifyOpsAlert(params: {
  subject: string;
  headline: string;
  details: Record<string, string | number | null | undefined>;
  deepLink?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const link = params.deepLink || OPS_QUEUE_URL;
  const rows = Object.entries(params.details)
    .filter(([, v]) => v != null && String(v).length > 0)
    .map(([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">${escapeHtml(humanizeKey(k))}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(String(v))}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222;max-width:560px;">
      <div style="background:#b45309;padding:20px 24px;border-radius:8px 8px 0 0;">
        <span style="color:#fff;font-weight:700;font-size:16px;">eFinMoney Ops</span>
      </div>
      <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#92400e;">${escapeHtml(params.headline)}</h2>
        <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px;">${rows}</table>
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#1a237e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">Open ops queue</a>
      </div>
    </div>`;

  return sendOpsEmail(params.subject, html);
}

function humanizeKey(k: string): string {
  const map: Record<string, string> = {
    transfer_id: "Transfer ID",
    corridor: "Route",
    country: "Country",
    amount: "Amount",
    recipient: "Recipient",
    rails_tried: "Providers tried",
    error: "Error",
    policy: "Corridor rule",
  };
  return map[k] || k.replace(/_/g, " ");
}

export function opsAlertEmail(): string {
  return (Deno.env.get("OPS_ALERT_EMAIL") || DEFAULT_OPS_EMAIL).trim() || DEFAULT_OPS_EMAIL;
}

async function sendOpsEmail(subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
  if (!RESEND_API_KEY) return { sent: false, error: "RESEND_API_KEY missing" };
  const to = opsAlertEmail();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("notifyOpsAlert failed", res.status, t);
      return { sent: false, error: t.slice(0, 300) };
    }
    return { sent: true };
  } catch (e) {
    console.error("notifyOpsAlert error", e);
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
