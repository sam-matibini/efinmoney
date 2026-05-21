import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StatementRow } from "@/hooks/useStatement";
import { currencySymbol } from "./currency";

export interface StatementMeta {
  title: string;
  subtitle?: string;
  bankName?: string;
  accountHolder?: string;
  accountEmail?: string;
  accountNumber?: string;
  efinTag?: string;
  periodFrom?: string;
  periodTo?: string;
  currency?: string;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const buildTableData = (rows: StatementRow[]) =>
  rows
    .slice()
    .reverse() // chronological for statement
    .map((r) => [
      format(new Date(r.date), "yyyy-MM-dd HH:mm"),
      r.description,
      r.reference,
      r.payee,
      r.purpose,
      r.moneyOut ? `-${fmt(r.moneyOut)} ${r.currency}` : "",
      r.moneyIn ? `+${fmt(r.moneyIn)} ${r.currency}` : "",
      `${fmt(r.balance)} ${r.currency}`,
    ]);

const HEADERS = [
  "Date",
  "Description",
  "Reference",
  "Sender / Payee",
  "Purpose",
  "Money Out",
  "Money In",
  "Balance",
];

const totals = (rows: StatementRow[]) => {
  const out: Record<string, number> = {};
  const inc: Record<string, number> = {};
  for (const r of rows) {
    if (r.moneyOut) out[r.currency] = (out[r.currency] || 0) + r.moneyOut;
    if (r.moneyIn) inc[r.currency] = (inc[r.currency] || 0) + r.moneyIn;
  }
  return { out, inc };
};

export const downloadCSV = (rows: StatementRow[], meta: StatementMeta) => {
  const lines: string[] = [];
  lines.push(`"${meta.title.replace(/"/g, '""')}"`);
  lines.push(`"Bank","${(meta.bankName || "eFinMoney")}"`);
  if (meta.subtitle) lines.push(`"${meta.subtitle.replace(/"/g, '""')}"`);
  if (meta.accountHolder) lines.push(`"Account holder","${meta.accountHolder}"`);
  if (meta.accountNumber) lines.push(`"Account number","${meta.accountNumber}"`);
  if (meta.efinTag) lines.push(`"eFin tag","${meta.efinTag.startsWith("@") ? meta.efinTag : "@" + meta.efinTag}"`);
  if (meta.accountEmail) lines.push(`"Email","${meta.accountEmail}"`);
  if (meta.periodFrom || meta.periodTo)
    lines.push(`"Period","${meta.periodFrom || "—"} to ${meta.periodTo || "—"}"`);
  lines.push("");
  lines.push(HEADERS.map((h) => `"${h}"`).join(","));
  for (const row of buildTableData(rows)) {
    lines.push(
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${slug(meta.title)}.csv`);
  toast.success("CSV downloaded");
};

export const downloadXLSX = (rows: StatementRow[], meta: StatementMeta) => {
  const data = [
    [meta.title],
    ["Bank", meta.bankName || "eFinMoney"],
    meta.subtitle ? [meta.subtitle] : [],
    meta.accountHolder ? ["Account holder", meta.accountHolder] : [],
    meta.accountNumber ? ["Account number", meta.accountNumber] : [],
    meta.efinTag ? ["eFin tag", meta.efinTag.startsWith("@") ? meta.efinTag : "@" + meta.efinTag] : [],
    meta.accountEmail ? ["Email", meta.accountEmail] : [],
    meta.periodFrom || meta.periodTo
      ? ["Period", `${meta.periodFrom || "—"} to ${meta.periodTo || "—"}`]
      : [],
    [],
    HEADERS,
    ...buildTableData(rows),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 18 }, { wch: 36 }, { wch: 14 }, { wch: 22 }, { wch: 22 },
    { wch: 16 }, { wch: 16 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Statement");
  XLSX.writeFile(wb, `${slug(meta.title)}.xlsx`);
  toast.success("Excel downloaded");
};

export const generatePDFBlob = (rows: StatementRow[], meta: StatementMeta): Blob => {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("eFinMoney", margin, 40);
  doc.setFontSize(14);
  doc.text(meta.title, margin, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 80;
  if (meta.subtitle) { doc.text(meta.subtitle, margin, y); y += 14; }
  if (meta.accountHolder) { doc.text(`Account holder: ${meta.accountHolder}`, margin, y); y += 14; }
  if (meta.accountNumber) { doc.text(`Account number: ${meta.accountNumber}`, margin, y); y += 14; }
  if (meta.efinTag) { doc.text(`eFin tag: ${meta.efinTag.startsWith("@") ? meta.efinTag : "@" + meta.efinTag}`, margin, y); y += 14; }
  if (meta.accountEmail) { doc.text(`Email: ${meta.accountEmail}`, margin, y); y += 14; }
  if (meta.periodFrom || meta.periodTo) {
    doc.text(`Period: ${meta.periodFrom || "—"}  to  ${meta.periodTo || "—"}`, margin, y); y += 14;
  }
  doc.text(`Generated: ${format(new Date(), "PPpp")}`, margin, y); y += 8;

  const { out, inc } = totals(rows);
  const inStr = Object.entries(inc).map(([c, v]) => `+${currencySymbol(c)}${fmt(v)}`).join("  ");
  const outStr = Object.entries(out).map(([c, v]) => `-${currencySymbol(c)}${fmt(v)}`).join("  ");
  if (inStr || outStr) {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.text(`Total In: ${inStr || "0.00"}        Total Out: ${outStr || "0.00"}`, margin, y);
    y += 6;
  }

  autoTable(doc, {
    head: [HEADERS],
    body: buildTableData(rows),
    startY: y + 10,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      5: { halign: "right", textColor: [190, 24, 60] },
      6: { halign: "right", textColor: [4, 120, 87] },
      7: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      const str = `Page ${doc.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(str, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 16, { align: "right" });
      doc.text("eFinMoney · efin.money", margin, doc.internal.pageSize.getHeight() - 16);
    },
  });

  return doc.output("blob");
};

export const downloadPDF = (rows: StatementRow[], meta: StatementMeta) => {
  const blob = generatePDFBlob(rows, meta);
  triggerDownload(blob, `${slug(meta.title)}.pdf`);
  toast.success("PDF downloaded");
};

export const emailStatement = async (
  rows: StatementRow[],
  meta: StatementMeta,
  to: string,
  format: "pdf" | "csv" | "xlsx" = "pdf"
) => {
  const t = toast.loading("Sending statement...");
  try {
    let base64 = "";
    let filename = `${slug(meta.title)}.${format}`;
    let mime = "application/pdf";
    if (format === "pdf") {
      const blob = generatePDFBlob(rows, meta);
      base64 = await blobToBase64(blob);
      mime = "application/pdf";
    } else if (format === "csv") {
      const lines: string[] = [];
      lines.push(HEADERS.join(","));
      for (const r of buildTableData(rows))
        lines.push(r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
      base64 = btoa(unescape(encodeURIComponent("\uFEFF" + lines.join("\n"))));
      mime = "text/csv";
    } else {
      const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...buildTableData(rows)]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Statement");
      const ab = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      base64 = arrayBufferToBase64(ab);
      mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    const { error } = await supabase.functions.invoke("send-statement-email", {
      body: {
        to,
        title: meta.title,
        subtitle: meta.subtitle,
        period_from: meta.periodFrom,
        period_to: meta.periodTo,
        account_holder: meta.accountHolder,
        filename,
        mime,
        attachment_base64: base64,
      },
    });
    if (error) throw error;
    toast.success(`Statement sent to ${to}`, { id: t });
  } catch (e: any) {
    console.error(e);
    toast.error(e?.message || "Failed to send statement", { id: t });
  }
};

const triggerDownload = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "statement";

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      resolve(s.split(",")[1] || "");
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
};
