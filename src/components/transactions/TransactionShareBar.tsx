import { useState } from "react";
import { Share2, Printer, Download, Mail, MessageSquare, Link2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";

interface Entry {
  ledger_accounts?: { name?: string; code?: string } | null;
  description?: string | null;
  debit_amount: number | string;
  credit_amount: number | string;
  currency_code: string;
}

interface Props {
  entries: Entry[];
  journalId: string;
  referenceLabel: string;
  firstDate?: string;
  statusLine?: string;
}

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.555-5.338 11.89-11.893 11.89a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.595 5.39l-.999 3.648 3.893-.737zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
  </svg>
);

export default function TransactionShareBar({ entries, journalId, referenceLabel, firstDate, statusLine }: Props) {
  const [busy, setBusy] = useState(false);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const totalDebit = entries.reduce((s, e) => s + Number(e.debit_amount || 0), 0);
  const currency = entries[0]?.currency_code || "";

  const summary = [
    "eFinMoney — Transaction",
    `Ref: ${referenceLabel}`,
    statusLine ? `Status: ${statusLine}` : null,
    firstDate ? `Date: ${format(new Date(firstDate), "PPpp")}` : null,
    `Amount: ${totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
    `View: ${url}`,
  ].filter(Boolean).join("\n");

  const fullText = () => {
    const lines = [
      "eFinMoney — Transaction Report",
      "================================",
      `Reference: ${referenceLabel}`,
      statusLine ? `Status: ${statusLine}` : "",
      firstDate ? `Date: ${format(new Date(firstDate), "PPpp")}` : "",
      `Journal ID: ${journalId}`,
      "",
      "Account                              Debit          Credit",
      "----------------------------------------------------------",
      ...entries.map((e) => {
        const name = (e.ledger_accounts?.name || "—").padEnd(36).slice(0, 36);
        const d = Number(e.debit_amount) > 0 ? `${Number(e.debit_amount).toFixed(2)} ${e.currency_code}` : "—";
        const c = Number(e.credit_amount) > 0 ? `${Number(e.credit_amount).toFixed(2)} ${e.currency_code}` : "—";
        return `${name} ${d.padStart(14)} ${c.padStart(14)}`;
      }),
      "----------------------------------------------------------",
      `TOTAL                                ${totalDebit.toFixed(2).padStart(14)} ${totalDebit.toFixed(2).padStart(14)}`,
      "",
      `View online: ${url}`,
    ];
    return lines.join("\n");
  };

  const onShare = async () => {
    if (navigator.share) {
      try {
        setBusy(true);
        await navigator.share({ title: "eFinMoney Transaction", text: summary, url });
      } catch (e: any) {
        if (e?.name !== "AbortError") toast.error("Share cancelled");
      } finally {
        setBusy(false);
      }
    } else {
      await navigator.clipboard.writeText(summary);
      toast.success("Summary copied — paste into any chat");
    }
  };

  const openMail = () => {
    const subject = encodeURIComponent(`eFinMoney transaction — ${referenceLabel}`);
    const body = encodeURIComponent(summary);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };
  const openSms = () => {
    window.location.href = `sms:?&body=${encodeURIComponent(summary)}`;
  };
  const openWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, "_blank", "noopener");
  };
  const onPrint = () => window.print();

  const onDownload = () => {
    const blob = new Blob([fullText()], { type: "text/plain;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `transaction-${journalId.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    toast.success("Downloaded");
  };

  const onCopyLink = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={onShare} disabled={busy}>
        <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share
      </Button>
      <Button size="sm" variant="outline" onClick={openWhatsApp}>
        <WhatsAppIcon className="w-3.5 h-3.5 mr-1.5" /> WhatsApp
      </Button>
      <Button size="sm" variant="outline" onClick={openSms}>
        <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> SMS
      </Button>
      <Button size="sm" variant="outline" onClick={openMail}>
        <Mail className="w-3.5 h-3.5 mr-1.5" /> Email
      </Button>
      <Button size="sm" variant="outline" onClick={onPrint} title="Print or Save as PDF">
        <Printer className="w-3.5 h-3.5 mr-1.5" /> Print / PDF
      </Button>
      <Button size="sm" variant="outline" onClick={onDownload}>
        <FileText className="w-3.5 h-3.5 mr-1.5" /> Download
      </Button>
      <Button size="sm" variant="ghost" onClick={onCopyLink}>
        <Link2 className="w-3.5 h-3.5 mr-1.5" /> Copy link
      </Button>
    </div>
  );
}
