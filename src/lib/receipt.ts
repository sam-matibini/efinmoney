import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const downloadTransferReceipt = async (transferId: string) => {
  const t = toast.loading("Generating receipt...");
  try {
    const { data, error } = await supabase.functions.invoke("generate-receipt", {
      body: { transfer_id: transferId },
    });
    if (error) throw error;
    if (!data?.pdf_base64) throw new Error("No receipt returned");

    const bin = atob(data.pdf_base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.filename || `receipt-${transferId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Receipt downloaded", { id: t });
  } catch (e: any) {
    console.error(e);
    toast.error(e?.message || "Failed to generate receipt", { id: t });
  }
};
