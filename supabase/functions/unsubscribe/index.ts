// Public unsubscribe endpoint for announcement emails. The link in each email
// carries the user id + an HMAC token; we verify it, set profiles.email_opt_out,
// and return a small confirmation page. No login required (email link click).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UNSUB_SECRET = Deno.env.get("UNSUBSCRIBE_SECRET") || SERVICE_KEY;

async function expectedToken(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(UNSUB_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const page = (title: string, msg: string) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f7;">
  <div style="max-width:480px;margin:80px auto;padding:0 20px;text-align:center;">
    <div style="background:#fff;border-radius:16px;padding:40px 28px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <div style="font-size:22px;font-weight:800;color:#1a1440;margin-bottom:16px;">eFinMoney</div>
      <h1 style="font-size:19px;color:#1a1440;margin:0 0 10px;">${title}</h1>
      <p style="font-size:15px;color:#555;line-height:1.6;margin:0;">${msg}</p>
    </div>
  </div>
</body></html>`;

const htmlResponse = (html: string, status = 200) =>
  new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("u") || "";
    const token = url.searchParams.get("t") || "";
    if (!userId || !token) {
      return htmlResponse(page("Invalid link", "This unsubscribe link is missing information."), 400);
    }

    const expected = await expectedToken(userId);
    if (token !== expected) {
      return htmlResponse(page("Invalid link", "This unsubscribe link is not valid or has expired."), 400);
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await db.from("profiles").update({ email_opt_out: true }).eq("user_id", userId);
    if (error) {
      return htmlResponse(page("Something went wrong", "We couldn't update your preferences. Please try again later."), 500);
    }

    return htmlResponse(page(
      "You're unsubscribed",
      "You'll no longer receive announcement emails from eFinMoney. You can re-enable them anytime in your account settings. Important account and transaction emails will still be sent.",
    ));
  } catch (e) {
    console.error("unsubscribe", e);
    return htmlResponse(page("Something went wrong", "Please try again later."), 500);
  }
});
