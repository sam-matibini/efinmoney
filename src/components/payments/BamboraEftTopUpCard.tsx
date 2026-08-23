/**
 * CAD EFT debit collect via Bambora (save bank → batch debit → settle later).
 */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBamboraMethods } from "@/hooks/useBamboraMethods";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  walletId: string;
  walletCurrency: string;
  initialAmount?: string;
  embedded?: boolean;
  onComplete?: () => void;
};

export default function BamboraEftTopUpCard({
  walletId,
  walletCurrency,
  initialAmount = "",
  embedded = false,
  onComplete,
}: Props) {
  const ccy = walletCurrency.toUpperCase();
  const qc = useQueryClient();
  const { data: methods = [], isLoading } = useBamboraMethods();
  const bank = methods.find((m) => m.method_type === "bank");

  const [amount, setAmount] = useState(initialAmount);
  const [holder, setHolder] = useState("");
  const [institution, setInstitution] = useState("");
  const [branch, setBranch] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);

  if (ccy !== "CAD") {
    return <p className="text-sm text-destructive">Bambora EFT is CAD only.</p>;
  }

  const saveBank = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("bambora-save-bank", {
        body: {
          holder,
          institutionNumber: institution,
          branchNumber: branch,
          accountNumber: account,
          currency: "CAD",
        },
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error || error?.message || "Save failed");
      }
      toast.success("Bank account linked");
      qc.invalidateQueries({ queryKey: ["bambora-methods"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save bank");
    } finally {
      setBusy(false);
    }
  };

  const collect = async () => {
    const amt = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error("Enter at least C$1.00");
      return;
    }
    if (!bank) {
      toast.error("Link a bank account first");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("bambora-eft-collect", {
        body: { amount: amt, walletId, currency: "CAD" },
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error || error?.message || "EFT failed");
      }
      toast.success("EFT submitted", {
        description: (data as { message?: string })?.message ||
          "Funds credit after bank settlement (3–5 business days).",
      });
      onComplete?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "EFT collect failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Debit your Canadian bank account (EFT). Settlement is not instant — typically 3–5 business days.
      </p>

      {!embedded && (
        <div className="space-y-2">
          <Label>Amount (CAD)</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100.00" />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading bank profile…</p>
      ) : bank ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
          <p className="font-medium">{bank.bank_account_holder || "Bank account"}</p>
          <p className="text-muted-foreground">
            Inst {bank.institution_number} · Transit {bank.branch_number} · ••••{bank.account_last_four}
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">Link Canadian bank account</p>
          <div className="space-y-2">
            <Label>Account holder</Label>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Full legal name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Institution (3 digits)</Label>
              <Input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={3} placeholder="001" />
            </div>
            <div className="space-y-2">
              <Label>Transit (5 digits)</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} maxLength={5} placeholder="12345" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Account number</Label>
            <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Account number" />
          </div>
          <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => void saveBank()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Building2 className="h-4 w-4 mr-2" />}
            Save bank account
          </Button>
        </div>
      )}

      <Button className="w-full" disabled={busy || !bank} onClick={() => void collect()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Building2 className="h-4 w-4 mr-2" />}
        Debit C${Number(amount || 0).toFixed(2) || "—"}
      </Button>
    </div>
  );
}
