import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateBeneficiary, useUpdateBeneficiary, type Beneficiary, type BeneficiaryCategory } from "@/hooks/useBeneficiaries";
import { toast } from "sonner";
import CountryPicker from "@/components/ui/CountryPicker";
import { COUNTRIES, findCountryById, findCountryByCode, LIVE_SEND_COUNTRIES, isLiveSendCountryId } from "@/lib/countries";
import { ISO_COUNTRIES, findIsoCountry } from "@/lib/isoCountries";
import { COUNTRY_ISO2 } from "@/lib/countryIso";
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
  const [address, setAddress] = useState("");
  const [tel, setTel] = useState("");
  const [countryId, setCountryId] = useState<string>("Nigeria");
  const [method, setMethod] = useState<"mobile" | "bank" | "eft" | "interac" | "none">("none");
  const [networkId, setNetworkId] = useState<string>("");

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
  const [addressCity, setAddressCity] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [addressPostal, setAddressPostal] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [addressCountryTouched, setAddressCountryTouched] = useState(false);
  const [mailingAddress, setMailingAddress] = useState("");
  const [mailingCity, setMailingCity] = useState("");
  const [mailingRegion, setMailingRegion] = useState("");
  const [mailingPostal, setMailingPostal] = useState("");
  const [mailingCountry, setMailingCountry] = useState("");
  const [sameAsAddress, setSameAsAddress] = useState(false);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory((editing?.category as BeneficiaryCategory) || defaultCategory || "person");
    setName(editing?.name || "");
    setNickname(editing?.nickname || "");
    setEmail(editing?.email || "");
    setAddress(editing?.address || "");
    setTel(editing?.tel || editing?.phone || "");
    const fromCode = editing?.country_code ? findCountryByCode(editing.country_code) : undefined;
    const resolvedId = fromCode?.id || "Nigeria";
    setCountryId(isLiveSendCountryId(resolvedId) ? resolvedId : (fromCode?.id || "Nigeria"));
    setMethod(
      editing?.eft_account ? "eft" :
      editing?.interac_email ? "interac" :
      editing?.bank_account ? "bank" :
      editing?.phone && editing?.payout_method && editing.payout_method !== "eft" && editing.payout_method !== "interac" && editing.payout_method !== "bank"
        ? "mobile"
        : (defaultMethod || "none")
    );
    const editCountry = fromCode;
    const savedNetwork = String(editing?.network || "").toLowerCase();
    const matched = editCountry?.networks?.find(
      (n) => n.id.toLowerCase() === savedNetwork || n.payout === editing?.payout_method,
    );
    setNetworkId(matched?.id || "");

    setBankName(editing?.bank_name || "");
    setBankCode(editing?.bank_code || "");
    setBankAccount(editing?.bank_account || "");
    setResolvedAccountName(null);
    setEftInst(editing?.eft_institution || "");
    setEftTransit(editing?.eft_transit || "");
    setEftAcct(editing?.eft_account || "");
    setEftHolder(editing?.eft_account_holder || "");
    setInteracEmail(editing?.interac_email || "");
    const e: any = editing || {};
    setAddressCity(e.address_city || "");
    setAddressRegion(e.address_region || "");
    setAddressPostal(e.address_postal_code || "");
    setAddressCountry(e.address_country_code || "");
    setAddressCountryTouched(!!editing);
    setMailingAddress(editing?.mailing_address || "");
    setMailingCity(editing?.mailing_city || "");
    setMailingRegion(editing?.mailing_region || "");
    setMailingPostal(editing?.mailing_postal_code || "");
    setMailingCountry(e.mailing_country_code || "");
    const norm = (s?: string | null) => (s || "").trim().toLowerCase();
    const parts: [string, string][] = [
      [e.address, e.mailing_address],
      [e.address_city, e.mailing_city],
      [e.address_region, e.mailing_region],
      [e.address_postal_code, e.mailing_postal_code],
      [e.address_country_code, e.mailing_country_code],
    ];
    setSameAsAddress(!!norm(e.address) && parts.every(([a, m]) => norm(a) === norm(m)));
    setNotes(editing?.notes || "");
    setTags((editing?.tags || []).join(", "));
    setShowAdvanced(!!editing?.notes || !!editing?.tags?.length);
  }, [open, editing, defaultCategory, defaultMethod]);

  const country = findCountryById(countryId) || LIVE_SEND_COUNTRIES[0] || COUNTRIES[0];
  const pickerCountries = useMemo(() => {
    const base = [...LIVE_SEND_COUNTRIES];
    if (country && !base.some((c) => c.id === country.id)) base.push(country);
    return base;
  }, [country]);
  const isNigeriaBank = method === "bank" && country.code === "NGN";
  const countryNetworks = country.networks || [];
  const activeNetwork = countryNetworks.find((n) => n.id === networkId) || null;

  // Keep the operator valid for the selected country.
  useEffect(() => {
    if (countryNetworks.length === 0) {
      if (networkId) setNetworkId("");
      return;
    }
    if (!countryNetworks.some((n) => n.id === networkId)) {
      setNetworkId(countryNetworks[0].id);
    }
  }, [countryId, method]); // eslint-disable-line react-hooks/exhaustive-deps


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
    if (!email.trim()) { toast.error("Please enter an email"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error("Please enter a valid email"); return; }
    if (!tel.trim()) { toast.error("Please enter a phone number"); return; }
    if (!address.trim()) { toast.error("Please enter an address"); return; }
    if (method === "eft") {
      if (!/^\d{3}$/.test(eftInst) || !/^\d{5}$/.test(eftTransit) || !/^\d{7,12}$/.test(eftAcct)) {
        toast.error("EFT requires 3-digit institution, 5-digit transit, and 7-12 digit account");
        return;
      }
    }
    if (method === "interac" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(interacEmail)) {
      toast.error("Interac requires a valid email"); return;
    }
    if (method === "mobile" && !tel.trim()) {
      toast.error("Mobile payout requires a phone number"); return;
    }
    if (method === "mobile" && countryNetworks.length > 0 && !networkId) {
      toast.error("Select a mobile money operator"); return;
    }

    const payload: any = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      tel: tel.trim() || null,
      country_code: country.code,
      currency_code: country.code,
      payout_method: method === "mobile" ? (activeNetwork?.payout || country.payout) : method === "bank" ? "bank" : method === "eft" ? "eft" : method === "interac" ? "interac" : null,
      network: method === "mobile" ? (activeNetwork?.id || null) : null,
      phone: tel.trim() || null,

      bank_name: method === "bank" ? selectedBankName.trim() : null,
      bank_account: method === "bank" ? bankAccount.trim() : null,
      bank_code: method === "bank" && isNigeriaBank ? bankCode.trim() || null : null,
      eft_institution: method === "eft" ? eftInst : null,
      eft_transit: method === "eft" ? eftTransit : null,
      eft_account: method === "eft" ? eftAcct : null,
      eft_account_holder: method === "eft" ? (eftHolder.trim() || name.trim()) : null,
      interac_email: method === "interac" ? interacEmail.trim() : null,
      address_city: addressCity.trim() || null,
      address_region: addressRegion.trim() || null,
      address_postal_code: addressPostal.trim() || null,
      address_country_code: addressCountry || null,
      mailing_address: (sameAsAddress ? address.trim() : mailingAddress.trim()) || null,
      mailing_city: (sameAsAddress ? addressCity.trim() : mailingCity.trim()) || null,
      mailing_region: (sameAsAddress ? addressRegion.trim() : mailingRegion.trim()) || null,
      mailing_postal_code: (sameAsAddress ? addressPostal.trim() : mailingPostal.trim()) || null,
      mailing_country_code: (sameAsAddress ? addressCountry : mailingCountry) || null,
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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Who</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

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
              <CountryPicker
                value={countryId}
                onChange={(c) => setCountryId(c.id)}
                countries={pickerCountries}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Full Name / Business Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe or Acme Inc." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            <div className="space-y-2">
              <Label>Nickname (optional)</Label>
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Landlord" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="payee@example.com" required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
                placeholder={method === "mobile" ? "+260 977 000 000" : "+1 (555) 000-0000"}
                required
              />
              {method === "mobile" && (
                <p className="text-xs text-muted-foreground">Also used as the mobile money payout number.</p>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</p>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="City / Town" />
              <Input value={addressRegion} onChange={(e) => setAddressRegion(e.target.value)} placeholder="State / Province" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                value={addressCountry}
                onValueChange={(v) => {
                  setAddressCountryTouched(true);
                  setAddressCountry(v);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>
                  {ISO_COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={addressPostal} onChange={(e) => setAddressPostal(e.target.value)} placeholder="Postal / ZIP code" />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mailing address (optional)</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="same-as-address"
                checked={sameAsAddress}
                onCheckedChange={(v) => setSameAsAddress(v === true)}
              />
              <Label htmlFor="same-as-address" className="text-sm font-normal text-muted-foreground">
                Same as address
              </Label>
            </div>
            <Input
              value={sameAsAddress ? address : mailingAddress}
              onChange={(e) => setMailingAddress(e.target.value)}
              placeholder="Street address"
              readOnly={sameAsAddress}
              className={sameAsAddress ? "bg-muted/40" : undefined}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={sameAsAddress ? addressCity : mailingCity}
                onChange={(e) => setMailingCity(e.target.value)}
                placeholder="City / Town"
                readOnly={sameAsAddress}
                className={sameAsAddress ? "bg-muted/40" : undefined}
              />
              <Input
                value={sameAsAddress ? addressRegion : mailingRegion}
                onChange={(e) => setMailingRegion(e.target.value)}
                placeholder="State / Province"
                readOnly={sameAsAddress}
                className={sameAsAddress ? "bg-muted/40" : undefined}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sameAsAddress ? (
                <Input
                  value={findIsoCountry(addressCountry)?.name || ""}
                  readOnly
                  placeholder="Country"
                  className="bg-muted/40"
                />
              ) : (
                <Select value={mailingCountry} onValueChange={setMailingCountry}>
                  <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                  <SelectContent>
                    {ISO_COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                value={sameAsAddress ? addressPostal : mailingPostal}
                onChange={(e) => setMailingPostal(e.target.value)}
                placeholder="Postal / ZIP code"
                readOnly={sameAsAddress}
                className={sameAsAddress ? "bg-muted/40" : undefined}
              />
            </div>
          </div>


          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-2 border-t">Payout details</p>
          <div className="space-y-2">
            <Label>Default payout method</Label>

            <Tabs value={method} onValueChange={(v) => setMethod(v as any)}>
              <TabsList className="flex w-full flex-wrap h-auto gap-1 justify-start">
                <TabsTrigger className="flex-1 min-w-[72px]" value="none">None</TabsTrigger>
                <TabsTrigger className="flex-1 min-w-[72px]" value="eft">EFT 🇨🇦</TabsTrigger>
                <TabsTrigger className="flex-1 min-w-[72px]" value="interac">Interac</TabsTrigger>
                <TabsTrigger className="flex-1 min-w-[72px]" value="mobile">Mobile</TabsTrigger>
                <TabsTrigger className="flex-1 min-w-[72px]" value="bank">Bank</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {method === "mobile" && (
            countryNetworks.length > 0 ? (
              <div className="space-y-2">
                <Label>Mobile money operator</Label>
                <Select value={networkId} onValueChange={setNetworkId}>
                  <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                  <SelectContent>
                    {countryNetworks.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used to route {country.country} mobile money payouts for this payee.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {country.country} payouts use {country.method} — no operator choice needed.
              </p>
            )
          )}

          {method === "mobile" && !tel.trim() && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Enter a phone number above for mobile money payouts.
            </p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
