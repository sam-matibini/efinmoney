import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateBeneficiary, useUpdateBeneficiary, type Beneficiary, type BeneficiaryCategory } from "@/hooks/useBeneficiaries";
import { toast } from "sonner";
import CountryPicker from "@/components/ui/CountryPicker";
import { COUNTRIES, findCountryById, findCountryByCode } from "@/lib/countries";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getNigeriaBanks, resolveNigeriaAccount } from "@/lib/nombaNigeria";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Beneficiary | null;
  onSaved?: (b: Beneficiary) => void;
  defaultCategory?: BeneficiaryCategory;
  defaultMethod?: "mobile" | "bank" | "eft" | "interac" | "none";
}

const CATEGORIES: { value: BeneficiaryCategory; label: string }[] = [
  { value: "person", label: "Person" },
  { value: "supplier", label: "Supplier" },
  { value: "employee", label: "Employee" },
  { value: "contractor", label: "Contractor" },
  { value: "payee", label: "Payee / Vendor" },
  { value: "other", label: "Other" },
];

const AddBeneficiaryModal = ({ open, onOpenChange, editing, onSaved, defaultCategory, defaultMethod }: Props) => {
  const create = useCreateBeneficiary();
  const update = useUpdateBeneficiary();
  const [category, setCategory] = useState<BeneficiaryCategory>("person");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [countryId, setCountryId] = useState<string>("Canada");
  const [method, setMethod] = useState<"mobile" | "bank" | "eft" | "interac" | "none">("none");
  const [phone, setPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [ngnBanks, setNgnBanks] = useState<{ code: string; name: string }[]>([]);
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [resolvedAccountName, setResolvedAccountName] = useState<string | null>(null);
  // Canadian EFT
  const [eftInst, setEftInst] = useState("");
  const [eftTransit, setEftTransit] = useState("");
  const [eftAcct, setEftAcct] = useState("");
  const [eftHolder, setEftHolder] = useState("");
  // Interac
  const [interacEmail, setInteracEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory((editing?.category as BeneficiaryCategory) || defaultCategory || "person");
    setName(editing?.name || "");
    setNickname(editing?.nickname || "");
    setEmail(editing?.email || "");
    const fromCode = editing?.country_code ? findCountryByCode(editing.country_code) : undefined;
    setCountryId(fromCode?.id || "Canada");
    setMethod(
      editing?.eft_account ? "eft" :
      editing?.interac_email ? "interac" :
      editing?.bank_account ? "bank" :
      editing?.phone ? "mobile" : (defaultMethod || "none")
    );
    setPhone(editing?.phone || "");
    setBankName(editing?.bank_name || "");
    setBankCode(editing?.bank_code || "");
    setBankAccount(editing?.bank_account || "");
    setResolvedAccountName(null);
    setEftInst(editing?.eft_institution || "");
    setEftTransit(editing?.eft_transit || "");
    setEftAcct(editing?.eft_account || "");
    setEftHolder(editing?.eft_account_holder || "");
    setInteracEmail(editing?.interac_email || "");
    setNotes(editing?.notes || "");
    setTags((editing?.tags || []).join(", "));
    setShowAdvanced(!!editing?.notes || !!editing?.tags?.length);
  }, [open, editing, defaultCategory, defaultMethod]);

  const country = findCountryById(countryId) || COUNTRIES[0];
  const isNigeriaBank = method === "bank" && country.code === "NGN";

  useEffect(() => {
    if (!open || !isNigeriaBank || ngnBanks.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { banks } = await getNigeriaBanks();
        if (!cancelled) setNgnBanks(banks.map((b) => ({ code: b.code, name: b.name })));
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [open, isNigeriaBank, ngnBanks.length]);

  useEffect(() => {
    if (!isNigeriaBank) {
      setResolvedAccountName(null);
      return;
    }
    const acct = bankAccount.replace(/\D/g, "");
    if (!bankCode || acct.length !== 10) {
      setResolvedAccountName(null);
      return;
    }
    let cancelled = false;
    setResolvingAccount(true);
    (async () => {
      try {
        const data = await resolveNigeriaAccount(acct, bankCode);
        if (cancelled) return;
        if (data?.resolved && data.account_name) {
          setResolvedAccountName(data.account_name);
          if (!name.trim()) setName(data.account_name);
        } else {
          setResolvedAccountName(null);
        }
      } catch {
        if (!cancelled) setResolvedAccountName(null);
      } finally {
        if (!cancelled) setResolvingAccount(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNigeriaBank, bankCode, bankAccount, name]);

  const selectedBankName = useMemo(() => {
    if (!isNigeriaBank) return bankName;
    return ngnBanks.find((b) => b.code === bankCode)?.name || bankName;
  }, [isNigeriaBank, bankCode, bankName, ngnBanks]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Please enter a name"); return; }
    if (method === "eft") {
      if (!/^\d{3}$/.test(eftInst) || !/^\d{5}$/.test(eftTransit) || !/^\d{7,12}$/.test(eftAcct)) {
        toast.error("EFT requires 3-digit institution, 5-digit transit, and 7-12 digit account");
        return;
      }
    }
    if (method === "interac" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(interacEmail)) {
      toast.error("Interac requires a valid email"); return;
    }

    const payload: any = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      email: email.trim() || null,
      country_code: country.code,
      currency_code: country.code,
      payout_method: method === "mobile" ? country.payout : method === "bank" ? "bank" : method === "eft" ? "eft" : method === "interac" ? "interac" : null,
      phone: method === "mobile" ? phone.trim() : null,
      bank_name: method === "bank" ? selectedBankName.trim() : null,
      bank_account: method === "bank" ? bankAccount.trim() : null,
      bank_code: method === "bank" && isNigeriaBank ? bankCode.trim() || null : null,
      eft_institution: method === "eft" ? eftInst : null,
      eft_transit: method === "eft" ? eftTransit : null,
      eft_account: method === "eft" ? eftAcct : null,
      eft_account_holder: method === "eft" ? (eftHolder.trim() || name.trim()) : null,
      interac_email: method === "interac" ? interacEmail.trim() : null,
      category,
      notes: notes.trim() || null,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    };

    try {
      const isEdit = !!editing?.id;
      const saved = isEdit
        ? await update.mutateAsync({ id: editing!.id, ...payload })
        : await create.mutateAsync(payload);
      toast.success(isEdit ? "Saved" : "Payee added");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing?.id ? "Edit Payee" : "Add Payee"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as BeneficiaryCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <CountryPicker value={countryId} onChange={(c) => setCountryId(c.id)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Full Name / Business Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe or Acme Inc." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nickname (optional)</Label>
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Landlord" />
            </div>
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="payee@example.com" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Default payout method</Label>
            <Tabs value={method} onValueChange={(v) => setMethod(v as any)}>
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="none">None</TabsTrigger>
                <TabsTrigger value="eft">EFT 🇨🇦</TabsTrigger>
                <TabsTrigger value="interac">Interac</TabsTrigger>
                <TabsTrigger value="mobile">Mobile</TabsTrigger>
                <TabsTrigger value="bank">Bank</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {method === "mobile" && (
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254..." />
            </div>
          )}
          {method === "bank" && (
            <>
              {isNigeriaBank ? (
                <div className="space-y-2">
                  <Label>Bank</Label>
                  <Select
                    value={bankCode}
                    onValueChange={(code) => {
                      setBankCode(code);
                      const match = ngnBanks.find((b) => b.code === code);
                      if (match) setBankName(match.name);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {ngnBanks.map((b) => (
                        <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder={isNigeriaBank ? "10-digit NUBAN" : "Account number"}
                  inputMode="numeric"
                />
                {isNigeriaBank && resolvingAccount && (
                  <p className="text-xs text-muted-foreground">Verifying account…</p>
                )}
                {isNigeriaBank && resolvedAccountName && (
                  <p className="text-xs text-emerald-600">Verified: {resolvedAccountName}</p>
                )}
              </div>
            </>
          )}
          {method === "eft" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Institution # (3)</Label>
                  <Input inputMode="numeric" maxLength={3} value={eftInst} onChange={(e) => setEftInst(e.target.value.replace(/\D/g, ""))} placeholder="001" /></div>
                <div className="space-y-2"><Label>Transit # (5)</Label>
                  <Input inputMode="numeric" maxLength={5} value={eftTransit} onChange={(e) => setEftTransit(e.target.value.replace(/\D/g, ""))} placeholder="12345" /></div>
              </div>
              <div className="space-y-2"><Label>Account #</Label>
                <Input inputMode="numeric" value={eftAcct} onChange={(e) => setEftAcct(e.target.value.replace(/\D/g, ""))} placeholder="1234567" /></div>
              <div className="space-y-2"><Label>Account holder (as on bank)</Label>
                <Input value={eftHolder} onChange={(e) => setEftHolder(e.target.value)} placeholder={name || "Jane Doe"} /></div>
            </>
          )}
          {method === "interac" && (
            <div className="space-y-2">
              <Label>Interac Email</Label>
              <Input type="email" value={interacEmail} onChange={(e) => setInteracEmail(e.target.value)} placeholder="payee@example.com" />
            </div>
          )}

          <button type="button" onClick={() => setShowAdvanced(s => !s)} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Notes & tags
          </button>
          {showAdvanced && (
            <>
              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="rent, monthly" />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : editing?.id ? "Save Changes" : "Add Payee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddBeneficiaryModal;
export { COUNTRIES as BENEFICIARY_COUNTRIES };
