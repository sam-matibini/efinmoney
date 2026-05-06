import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateBeneficiary, useUpdateBeneficiary, type Beneficiary } from "@/hooks/useBeneficiaries";
import { toast } from "sonner";

const COUNTRIES = [
  { code: "KES", country: "Kenya", flag: "🇰🇪", method: "M-Pesa", payout: "mpesa" },
  { code: "UGX", country: "Uganda", flag: "🇺🇬", method: "Mobile Money", payout: "airtel_money" },
  { code: "TZS", country: "Tanzania", flag: "🇹🇿", method: "M-Pesa", payout: "mpesa" },
  { code: "ZMW", country: "Zambia", flag: "🇿🇲", method: "MTN Mobile", payout: "mtn_mobile" },
  { code: "BIF", country: "Burundi", flag: "🇧🇮", method: "Lumicash", payout: "lumicash" },
  { code: "NGN", country: "Nigeria", flag: "🇳🇬", method: "Bank/Mobile", payout: "bank" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Beneficiary | null;
  onSaved?: (b: Beneficiary) => void;
}

const AddBeneficiaryModal = ({ open, onOpenChange, editing, onSaved }: Props) => {
  const create = useCreateBeneficiary();
  const update = useUpdateBeneficiary();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [countryCode, setCountryCode] = useState("KES");
  const [method, setMethod] = useState<"mobile" | "bank">("mobile");
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  useEffect(() => {
    if (open) {
      setName(editing?.name || "");
      setNickname(editing?.nickname || "");
      setCountryCode(editing?.country_code || "KES");
      setMethod(editing?.bank_account ? "bank" : "mobile");
      setPhone(editing?.phone || "");
      setBankName(editing?.bank_name || "");
      setBankAccount(editing?.bank_account || "");
    }
  }, [open, editing]);

  const country = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    if (method === "mobile" && !phone.trim()) {
      toast.error("Please enter a phone number");
      return;
    }
    if (method === "bank" && (!bankName.trim() || !bankAccount.trim())) {
      toast.error("Please enter bank details");
      return;
    }

    const payload = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      country_code: country.code,
      currency_code: country.code,
      payout_method: method === "mobile" ? country.payout : "bank",
      phone: method === "mobile" ? phone.trim() : null,
      bank_name: method === "bank" ? bankName.trim() : null,
      bank_account: method === "bank" ? bankAccount.trim() : null,
    };

    try {
      const isEdit = !!editing?.id;
      const saved = isEdit
        ? await update.mutateAsync({ id: editing!.id, ...payload })
        : await create.mutateAsync(payload);
      toast.success(isEdit ? "Contact updated" : "Contact saved");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save contact");
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing?.id ? "Edit Contact" : "Add Contact"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipient's full name" />
          </div>
          <div className="space-y-2">
            <Label>Nickname (optional)</Label>
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Mum" />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.flag} {c.country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Tabs value={method} onValueChange={(v) => setMethod(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="mobile">Mobile Money</TabsTrigger>
              <TabsTrigger value="bank">Bank</TabsTrigger>
            </TabsList>
          </Tabs>
          {method === "mobile" ? (
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254..." />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Account number" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : editing ? "Save Changes" : "Add Contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddBeneficiaryModal;
export { COUNTRIES as BENEFICIARY_COUNTRIES };
