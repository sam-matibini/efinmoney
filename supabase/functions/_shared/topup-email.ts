import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Admin = ReturnType<typeof createClient>;

function currencySymbol(c: string): string {
  const s: Record<string, string> = {
    CAD: "C$", USD: "$", EUR: "€", GBP: "£", NGN: "₦", GHS: "GH₵",
    KES: "KSh", UGX: "USh", TZS: "TSh", RWF: "FRw", ZMW: "ZK",
    AUD: "A$", NZD: "NZ$", HKD: "HK$", SGD: "S$",
  };
  return s[c] || c;
}

function topupHtml(d: {
  currency: string;
  amount: number;
  appUrl: string;
  reference?: string;
}): string {
  const sym = currencySymbol(d.currency);
  const amt = d.currency === "NGN"
    ? d.amount.toLocaleString()
    : d.amount.toFixed(2);
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 12px">Wallet Topped Up ✅</h1>
      <p style="line-height:1.55">Your wallet has been credited successfully.</p>
      <div style="margin:20px 0;padding:20px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4">
        <p style="margin:0 0 6px;color:#065f46;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Amount credited</p>
        <p style="margin:0;font-size:26px;font-weight:700;color:#065f46">${sym}${amt} ${d.currency}</p>
        ${d.reference ? `<p style="margin:8px 0 0;color:#047857;font-size:12px;font-family:monospace">Ref: ${d.reference}</p>` : ""}
      </div>
      <a href="${d.appUrl}/wallets" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:9999px;font-weight:600;font-size:14px">
        View wallet
      </a>
      <p style="color:#64748b;font-size:12px;margin-top:32px">— The eFinMoney Team</p>
    </div>`;
}

export async function sendTopupEmail(
  admin: Admin,
  userId: string,
  currency: string,
  amount: number,
  reference?: string,
): Promise<void> {
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const email = profile?.email;
    if (!email) return;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return;

    const appUrl = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
    const sym = currencySymbol(currency);
    const html = topupHtml({ currency, amount, appUrl, reference });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "eFinMoney <noreply@efinsuite.com>",
        to: [email],
        cc: ["support@efin.money"],
        subject: `Wallet topped up — ${sym}${amount.toFixed(2)} ${currency}`,
        html,
      }),
    });
  } catch (e) {
    console.warn("sendTopupEmail failed", e);
  }
}
