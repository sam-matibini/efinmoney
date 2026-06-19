// Supabase "Send Email" auth hook -> routes ALL auth emails (signup confirmation,
// invite, magic link, password recovery, email change, reauthentication) through Resend
// with branded eFinMoney templates. The verification link points at our own
// /auth/confirm page so we can show a success screen and auto sign the user in.
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const HOOK_SECRET = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "").replace(/^v1,whsec_/, "");
const FROM = "eFinMoney <noreply@efinsuite.com>";
const BRAND = "#4f46e5";

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
}

interface HookPayload {
  user: { email: string };
  email_data: EmailData;
}

const shell = (heading: string, intro: string, inner: string) => `
  <div style="font-family:Inter,system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;padding:32px 24px;color:#0f172a">
    <h1 style="font-size:22px;margin:0 0 12px">${heading}</h1>
    <p style="line-height:1.6;margin:0 0 20px;color:#334155">${intro}</p>
    ${inner}
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin-top:28px">
      If you didn't request this, you can safely ignore this email.
    </p>
    <p style="color:#64748b;font-size:12px;margin-top:16px">— The eFinMoney Team</p>
  </div>`;

const button = (url: string, label: string) => `
  <a href="${url}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:9999px;font-weight:600;font-size:15px">${label}</a>
  <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin-top:18px">
    Or paste this link into your browser:<br/>
    <a href="${url}" style="color:${BRAND};word-break:break-all">${url}</a>
  </p>`;

const codeBlock = (code: string) => `
  <div style="margin:8px 0 4px;padding:18px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;text-align:center">
    <span style="font-size:28px;font-weight:700;letter-spacing:0.3em;font-family:ui-monospace,Menlo,monospace">${code}</span>
  </div>`;

function buildEmail(
  action: string,
  url: string,
  token: string,
  opts?: { staffInvite?: boolean },
): { subject: string; html: string } {
  switch (action) {
    case "invite":
      if (opts?.staffInvite) {
        return {
          subject: "You're invited to the eFinMoney admin portal",
          html: shell(
            "Staff invitation",
            "You've been invited to join the eFinMoney admin team. Accept this invite to set your password, complete your profile, and upload an ID document for review.",
            button(url, "Accept invitation"),
          ),
        };
      }
      return {
        subject: "You're invited to eFinMoney",
        html: shell("You've been invited 🎉", "You've been invited to join eFinMoney. Confirm your email to activate your account.", button(url, "Accept invite")),
      };
    case "recovery":
      return {
        subject: "Reset your eFinMoney password",
        html: shell("Reset your password", "We received a request to reset your password. Click below to confirm it's you and choose a new password.", button(url, "Reset password")),
      };
    case "magiclink":
      return {
        subject: "Your eFinMoney sign-in link",
        html: shell("Sign in to eFinMoney", "Click below to securely sign in to your account.", button(url, "Sign in")),
      };
    case "email_change":
      return {
        subject: "Confirm your new email — eFinMoney",
        html: shell("Confirm your new email", "Confirm this address to finish updating the email on your eFinMoney account.", button(url, "Confirm email")),
      };
    case "reauthentication":
      return {
        subject: "Your eFinMoney verification code",
        html: shell("Verification code", "Enter this code to continue. It expires shortly.", codeBlock(token || "")),
      };
    case "signup":
    default:
      return {
        subject: "Confirm your email — eFinMoney",
        html: shell("Confirm your email ✨", "Welcome to eFinMoney! Confirm your email address to activate your account — you'll be signed in automatically.", button(url, "Verify my email")),
      };
  }
}

const jsonError = (http_code: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code, message } }), {
    status: http_code,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let event: HookPayload;
  try {
    if (HOOK_SECRET) {
      const wh = new Webhook(HOOK_SECRET);
      event = wh.verify(payload, headers) as HookPayload;
    } else {
      event = JSON.parse(payload) as HookPayload;
    }
  } catch (_e) {
    return jsonError(401, "Invalid webhook signature");
  }

  if (!RESEND_API_KEY) return jsonError(500, "RESEND_API_KEY not configured");

  const to = event.user?.email;
  const ed = event.email_data;
  if (!to || !ed?.token_hash) return jsonError(400, "Malformed hook payload");

  let origin = ed.site_url;
  let nextPath = "/";
  try {
    const u = new URL(ed.redirect_to);
    origin = u.origin;
    nextPath = u.pathname || "/";
  } catch {
    /* keep site_url fallback */
  }

  const confirmUrl =
    `${origin}/auth/confirm?token_hash=${encodeURIComponent(ed.token_hash)}` +
    `&type=${encodeURIComponent(ed.email_action_type)}&next=${encodeURIComponent(nextPath)}`;

  const staffInvite = nextPath === "/admin/onboarding";
  const { subject, html } = buildEmail(ed.email_action_type, confirmUrl, ed.token, { staffInvite });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Resend error:", body);
    return jsonError(502, "Failed to send email");
  }

  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
});
