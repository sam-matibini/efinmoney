// Generates a branded PDF receipt for a transfer.
// Body: { transfer_id: string, email?: boolean }
// Returns: { pdf_base64, filename, reference, email_sent? }

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BRAND_GREEN = rgb(16 / 255, 185 / 255, 129 / 255); // #10b981
const TEXT_DARK = rgb(15 / 255, 23 / 255, 42 / 255);     // slate-900
const TEXT_MUTED = rgb(100 / 255, 116 / 255, 139 / 255); // slate-500
const ROW_DIVIDER = rgb(226 / 255, 232 / 255, 240 / 255);

const refOf = (id: string) =>
  `EFM-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const currencySymbol = (code: string) => {
  const map: Record<string, string> = {
    USD: "$", CAD: "C$", EUR: "EUR ", GBP: "GBP ", NGN: "N",
    KES: "KSh ", UGX: "USh ", TZS: "TSh ", ZMW: "ZK ", BIF: "FBu ",
  };
  return map[code] || code + " ";
};

const formatMoney = (amt: number, code: string) =>
  `${currencySymbol(code)}${Number(amt).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${code}`;

async function buildPdf(transfer: any, senderEmail: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const { width } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const reference = refOf(transfer.id);
  const M = 50; // margin

  // ===== Header band =====
  page.drawRectangle({
    x: 0, y: 792, width, height: 50, color: BRAND_GREEN,
  });
  page.drawText("eFinMoney", {
    x: M, y: 808, size: 22, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText("Cross-border payments", {
    x: M, y: 798, size: 9, font, color: rgb(1, 1, 1),
  });
  const generatedAt = new Date().toUTCString();
  page.drawText(`Generated: ${generatedAt}`, {
    x: width - M - 200, y: 808, size: 9, font, color: rgb(1, 1, 1),
  });

  // ===== Title =====
  let y = 750;
  page.drawText("Transfer Receipt", {
    x: M, y, size: 24, font: bold, color: TEXT_DARK,
  });

  // ===== Reference + Status =====
  y -= 40;
  page.drawText("Reference", { x: M, y, size: 9, font, color: TEXT_MUTED });
  page.drawText(reference, {
    x: M, y: y - 18, size: 20, font: bold, color: TEXT_DARK,
  });

  const statusText =
    transfer.status === "completed" ? "COMPLETED"
    : ["failed", "reversed", "expired"].includes(transfer.status) ? transfer.status.toUpperCase()
    : "PROCESSING";
  const statusColor =
    transfer.status === "completed" ? BRAND_GREEN
    : ["failed", "reversed", "expired"].includes(transfer.status) ? rgb(0.85, 0.2, 0.2)
    : rgb(0.85, 0.65, 0.13);
  const statusLabel = transfer.status === "completed" ? `${statusText} ✓` : statusText;
  const sw = bold.widthOfTextAtSize(statusLabel, 12);
  page.drawRectangle({
    x: width - M - sw - 20, y: y - 18, width: sw + 20, height: 26,
    color: rgb(statusColor.red * 0.15 + 0.85, statusColor.green * 0.15 + 0.85, statusColor.blue * 0.15 + 0.85),
    borderColor: statusColor, borderWidth: 1,
  });
  page.drawText(statusLabel, {
    x: width - M - sw - 10, y: y - 10, size: 12, font: bold, color: statusColor,
  });

  // ===== Parties =====
  y -= 60;
  const drawSection = (title: string, atY: number) => {
    page.drawText(title, { x: M, y: atY, size: 11, font: bold, color: BRAND_GREEN });
    page.drawLine({
      start: { x: M, y: atY - 4 }, end: { x: width - M, y: atY - 4 },
      thickness: 1, color: BRAND_GREEN,
    });
  };
  const drawRow = (label: string, value: string, atY: number, opts?: { bold?: boolean; color?: any }) => {
    page.drawText(label, { x: M, y: atY, size: 10, font, color: TEXT_MUTED });
    const f = opts?.bold ? bold : font;
    const c = opts?.color || TEXT_DARK;
    const valWidth = f.widthOfTextAtSize(value, 11);
    page.drawText(value, { x: width - M - valWidth, y: atY, size: 11, font: f, color: c });
    page.drawLine({
      start: { x: M, y: atY - 6 }, end: { x: width - M, y: atY - 6 },
      thickness: 0.5, color: ROW_DIVIDER,
    });
  };

  drawSection("Sender", y);
  y -= 22;
  drawRow("Name", senderEmail.split("@")[0], y); y -= 22;
  drawRow("Email", senderEmail, y); y -= 30;

  drawSection("Recipient", y);
  y -= 22;
  drawRow("Name", transfer.recipient_name || "—", y); y -= 22;
  drawRow("Phone", transfer.recipient_phone || "—", y); y -= 22;
  drawRow("Country", transfer.recipient_country || "—", y); y -= 22;
  drawRow("Payout Method", (transfer.payout_method || transfer.transfer_type || "—").replace(/_/g, " "), y); y -= 30;

  // ===== Financial table =====
  drawSection("Financial Details", y);
  y -= 22;
  drawRow("Amount Sent", formatMoney(Number(transfer.source_amount), transfer.source_currency), y); y -= 22;
  drawRow(
    "Exchange Rate",
    `1 ${transfer.source_currency} = ${Number(transfer.exchange_rate).toFixed(4)} ${transfer.target_currency}`,
    y,
  ); y -= 22;
  drawRow("Transfer Fee", formatMoney(Number(transfer.fee_amount), transfer.source_currency), y); y -= 22;
  drawRow(
    "Recipient Receives",
    formatMoney(Number(transfer.target_amount), transfer.target_currency),
    y, { bold: true, color: BRAND_GREEN },
  );

  // ===== QR code =====
  try {
    const qrDataUrl = await QRCode.toDataURL(reference, { width: 200, margin: 1 });
    const pngBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
    const qrImg = await pdf.embedPng(pngBytes);
    const qrSize = 90;
    page.drawImage(qrImg, { x: width - M - qrSize, y: 130, width: qrSize, height: qrSize });
    page.drawText("Scan to verify", {
      x: width - M - qrSize, y: 120, size: 8, font, color: TEXT_MUTED,
    });
  } catch (e) {
    console.warn("QR generation failed", e);
  }

  // ===== Footer =====
  page.drawLine({
    start: { x: M, y: 105 }, end: { x: width - M, y: 105 },
    thickness: 0.5, color: ROW_DIVIDER,
  });
  const footerLines = [
    "This receipt is proof of transfer initiation. eFinMoney is not responsible",
    "for delays caused by recipient network providers.",
    "",
    "Support: support@efinmoney.com   |   Reference: " + reference,
  ];
  let fy = 90;
  for (const line of footerLines) {
    page.drawText(line, { x: M, y: fy, size: 9, font, color: TEXT_MUTED });
    fy -= 12;
  }

  const bytes = await pdf.save();
  // Convert to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), reference };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { transfer_id, email: shouldEmail = false } = body || {};
    if (!transfer_id || typeof transfer_id !== "string") {
      return new Response(JSON.stringify({ error: "transfer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch transfer
    const { data: transfer, error } = await supabase
      .from("transfers").select("*").eq("id", transfer_id).maybeSingle();
    if (error || !transfer) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: if a user JWT is present, ensure they own the transfer.
    // Otherwise (service-role / DB trigger) allow.
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ") && !authHeader.includes(SERVICE_KEY)) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user || u.user.id !== transfer.sender_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Lookup sender email
    const { data: profile } = await supabase
      .from("profiles").select("email").eq("user_id", transfer.sender_id).maybeSingle();
    const senderEmail = profile?.email || "—";

    const { base64, reference } = await buildPdf(transfer, senderEmail);
    const filename = `eFinMoney-Receipt-${reference}.pdf`;

    let email_sent = false;
    if (shouldEmail && profile?.email) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "eFinMoney <noreply@efinsuite.com>",
            to: [profile.email],
            subject: `Your eFinMoney transfer receipt (${reference})`,
            html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
              <h1 style="font-size:22px;margin:0 0 12px;color:#10b981">Transfer Completed</h1>
              <p>Your transfer to <strong>${transfer.recipient_name}</strong> has been delivered.</p>
              <p>Amount: <strong>${formatMoney(Number(transfer.source_amount), transfer.source_currency)}</strong></p>
              <p>Reference: <strong style="font-family:monospace">${reference}</strong></p>
              <p>Your full PDF receipt is attached to this email.</p>
              <p style="color:#64748b;font-size:12px;margin-top:32px">— eFinMoney</p>
            </div>`,
            attachments: [{ filename, content: base64 }],
          }),
        });
        const ej = await resp.json().catch(() => ({}));
        if (!resp.ok) console.error("Resend error:", ej);
        else email_sent = true;
      }
    }

    return new Response(
      JSON.stringify({ pdf_base64: base64, filename, reference, email_sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-receipt error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
