import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  validateBankFields,
} from "@/lib/bankFieldSchemas";

export const BANK_COUNTRY_OPTIONS = [
  { code: "CA", label: "Canada (EFT)" },
  { code: "US", label: "United States (ACH)" },
  { code: "NG", label: "Nigeria" },
  { code: "ZM", label: "Zambia" },
  { code: "KE", label: "Kenya" },
  { code: "GH", label: "Ghana" },
  { code: "GB", label: "United Kingdom" },
  { code: "EU", label: "Eurozone" },
  { code: "DEFAULT", label: "Other country" },
];

export interface BankDetailsSubmit {
  sourceId: string | null;
  values: Record<string, string>;
  country: string;
}

interface Props {
  walletCurrency: string;
  countryCode?: string | null;
  /** Label of the primary action button. */
  submitLabel?: string;
  /** Disable the primary action (e.g. amount not entered yet). */
  submitDisabled?: boolean;
  /** External busy state shown on the primary action. */
  submitting?: boolean;
  /** Always render the fields instead of hiding them behind "Quick add". */
  alwaysOpen?: boolean;
  /** Rendered above the form (e.g. Plaid instant-link button). */
  headerSlot?: ReactNode;
  /** Called after the account is saved (or when a saved account is reused). */
  onSubmit?: (result: BankDetailsSubmit) => void | Promise<void>;
}

export default function BankDetailsForm({
  walletCurrency,
  countryCode,
  submitLabel = "Save account",
  submitDisabled = false,
  submitting = false,
  alwaysOpen = false,
  headerSlot,
  onSubmit,
}: Props) {
  const currency = walletCurrency.toUpperCase();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [country, setCountry] = useState(() => (countryCode || countryForCurrency(currency)).toUpperCase());
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(alwaysOpen);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const schema = useMemo(() => bankSchemaForCountry(country), [country]);
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

  const accountRows = useMemo(() => {
    const rows: { id: string; institution: string; detail: string; plaid: boolean }[] = [];
    const seen = new Set<string>();
    const push = (row: { id: string; institution: string; detail: string; plaid: boolean }, key: string) => {
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(row);
    };
    for (const a of plaidAccounts) {
      const inst = (a.plaid_items as { institution_name?: string } | null)?.institution_name || "Bank";
      push(
        { id: `plaid:${a.id}`, institution: inst, detail: `${a.name} ····${a.mask}`, plaid: true },
        `${inst.toLowerCase()}|${a.mask ?? ""}`,
      );
    }
    for (const b of savedBanks) {
      const inst = b.institution || "Bank";
      push(
        { id: b.id, institution: inst, detail: `····${b.last_four} · ${b.currency_code}`, plaid: false },
        `${inst.toLowerCase()}|${b.last_four ?? ""}`,
      );
    }
    return rows;
  }, [plaidAccounts, savedBanks]);

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
      setSelectedId(data.id);
      if (!alwaysOpen) {
        setValues({});
        setShowForm(false);
      }
      void qc.invalidateQueries({ queryKey: ["linked_funding_sources"] });
      await onSubmit?.({ sourceId: data.id, values: trimmed, country });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save bank account");
    } finally {
      setSaving(false);
    }
  };

  const useSaved = async (rowId: string) => {
    setSelectedId(rowId);
    if (!onSubmit) return;
    await onSubmit({ sourceId: rowId.startsWith("plaid:") ? null : rowId, values: {}, country });
  };

  const busy = saving || submitting;

  return (
    <div className="space-y-4">
      {accountRows.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your accounts</Label>
          <div className="space-y-2">
            {accountRows.map((row) => (
              <button
                key={row.id}
                type="button"
                disabled={submitDisabled && !!onSubmit}
                onClick={() => void useSaved(row.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                  selectedId === row.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                {row.plaid ? (
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="flex-1 text-sm">
                  <span className="font-medium">{row.institution}</span>
                  <span className="text-muted-foreground"> — {row.detail}</span>
                </span>
                {selectedId === row.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {headerSlot}

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
                {BANK_COUNTRY_OPTIONS.map((c) => (
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
            {!alwaysOpen && (
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            )}
            <Button
              type="button"
              className="flex-1"
              onClick={() => void handleSave()}
              disabled={busy || submitDisabled}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
