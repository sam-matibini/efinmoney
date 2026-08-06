import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Building2, Check, Landmark, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFundingSources } from "@/hooks/useFundingSources";
import {
  accountIdentifier,
  bankSchemaForCountry,
  countryForCurrency,
  PLAID_COUNTRIES,
  validateBankFields,
} from "@/lib/bankFieldSchemas";

interface Props {
  walletCurrency: string;
  /** Country to preselect for the manual form (falls back to the currency's country). */
  countryCode?: string | null;
}

const COUNTRY_OPTIONS = [
  { code: "CA", label: "Canada" },
  { code: "US", label: "United States" },
  { code: "NG", label: "Nigeria" },
  { code: "ZM", label: "Zambia" },
  { code: "KE", label: "Kenya" },
  { code: "GH", label: "Ghana" },
  { code: "GB", label: "United Kingdom" },
  { code: "EU", label: "Eurozone" },
  { code: "DEFAULT", label: "Other country" },
];

export default function LinkBankPanel({ walletCurrency, countryCode }: Props) {
  const currency = walletCurrency.toUpperCase();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [country, setCountry] = useState(() => (countryCode || countryForCurrency(currency)).toUpperCase());
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const schema = useMemo(() => bankSchemaForCountry(country), [country]);
  const plaidSupported = PLAID_COUNTRIES.has(country);

  const { data: savedBanks = [] } = useFundingSources("bank");

  const { data: plaidAccounts = [] } = useQuery({
    queryKey: ["plaid_accounts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("plaid_accounts")
        .select("id,name,mask,subtype,item_id, plaid_items(institution_name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const startPlaid = useCallback(async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("plaid-create-link-token");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLinkToken(data.link_token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start bank linking");
    } finally {
      setLinking(false);
    }
  }, []);

  const onPlaidSuccess = useCallback(
    async (public_token: string, metadata: { institution?: { name?: string } }) => {
      try {
        const { data, error } = await supabase.functions.invoke("plaid-exchange-token", {
          body: { public_token, institution: metadata.institution },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success(`Linked ${metadata.institution?.name || "bank"}`);
        void qc.invalidateQueries({ queryKey: ["plaid_accounts", user?.id] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not link bank");
      } finally {
        setLinkToken(null);
      }
    },
    [qc, user?.id],
  );

  const { open, ready } = usePlaidLink({ token: linkToken || "", onSuccess: onPlaidSuccess });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const setField = (key: string, raw: string) => {
    const field = schema.fields.find((f) => f.key === key);
    let v = raw;
    if (field?.numeric) v = v.replace(/\D/g, "");
    if (field?.uppercase) v = v.toUpperCase();
    if (field?.maxLength) v = v.slice(0, field.maxLength);
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const handleSave = async () => {
    if (!user) return;
    const found = validateBankFields(schema, values);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    try {
      const trimmed: Record<string, string> = {};
      for (const f of schema.fields) {
        const v = (values[f.key] ?? "").trim();
        if (v) trimmed[f.key] = v;
      }
      const lastFour = accountIdentifier(trimmed);
      const { data, error } = await supabase
        .from("linked_funding_sources")
        .insert({
          user_id: user.id,
          source_type: "bank",
          display_name: `${trimmed.bank_name || "Bank"} ····${lastFour}`,
          institution: trimmed.bank_name || null,
          last_four: lastFour,
          currency_code: currency,
          country_code: country,
          details: trimmed,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Bank account saved");
      setValues({});
      setShowForm(false);
      setSelectedId(data.id);
      void qc.invalidateQueries({ queryKey: ["linked_funding_sources"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save bank account");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Link a bank with one tap, or add the account details manually. We ask only for what your
        country's banking system requires.
      </p>

      {(plaidAccounts.length > 0 || savedBanks.length > 0) && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your accounts</Label>
          <div className="space-y-2">
            {plaidAccounts.map((a) => {
              const id = `plaid:${a.id}`;
              const inst = (a.plaid_items as { institution_name?: string } | null)?.institution_name;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedId(id)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selectedId === id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm">
                    <span className="font-medium">{inst || "Bank"}</span>
                    <span className="text-muted-foreground"> — {a.name} ····{a.mask}</span>
                  </span>
                  {selectedId === id && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
            {savedBanks.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedId(b.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selectedId === b.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <Landmark className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm">
                  <span className="font-medium">{b.institution || "Bank"}</span>
                  <span className="text-muted-foreground"> ····{b.last_four} · {b.currency_code}</span>
                </span>
                {selectedId === b.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {plaidSupported && (
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => void startPlaid()}
          disabled={linking}
        >
          {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
          Link your bank instantly
        </Button>
      )}

      {!showForm ? (
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={() => setShowForm(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Quick add bank account
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-2">
            <Label>Bank country</Label>
            <Select
              value={country}
              onValueChange={(v) => {
                setCountry(v);
                setValues({});
                setErrors({});
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {schema.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`bank-${f.key}`}>
                {f.label}
                {!f.required && <span className="text-muted-foreground"> (optional)</span>}
              </Label>
              <Input
                id={`bank-${f.key}`}
                value={values[f.key] ?? ""}
                inputMode={f.numeric ? "numeric" : "text"}
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                onChange={(e) => setField(f.key, e.target.value)}
              />
              {errors[f.key] ? (
                <p className="text-xs text-destructive">{errors[f.key]}</p>
              ) : f.helper ? (
                <p className="text-xs text-muted-foreground">{f.helper}</p>
              ) : null}
            </div>
          ))}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save account
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
