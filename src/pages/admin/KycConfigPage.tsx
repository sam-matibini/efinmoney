import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import TopScrollSync from "@/components/admin-portal/TopScrollSync";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, RefreshCw, ShieldCheck, Search, UserCog, Layers } from "lucide-react";
import { toast } from "sonner";

type TierKey = "tier_1" | "tier_2" | "tier_3";
const VISIBLE_TIERS: TierKey[] = ["tier_1", "tier_2", "tier_3"];

const FEATURE_KEYS = ["receive", "send", "topup", "bills", "international", "virtual_card", "business"] as const;
type FeatureKey = (typeof FEATURE_KEYS)[number];

type TierRow = {
  tier: TierKey;
  label: string;
  max_balance: number;
  daily_limit: number;
  monthly_limit: number;
  single_limit: number;
  features_enabled: Record<string, boolean>;
};

export default function KycConfigPage() {
  const qc = useQueryClient();

  const { data: tiers, isLoading } = useQuery({
    queryKey: ["admin-tier-limits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tier_limits")
        .select("*")
        .in("tier", VISIBLE_TIERS)
        .order("tier");
      if (error) throw error;
      return (data ?? []) as unknown as TierRow[];
    },
  });

  const [draft, setDraft] = useState<Record<TierKey, TierRow> | null>(null);

  useEffect(() => {
    if (!tiers) return;
    const map = {} as Record<TierKey, TierRow>;
    tiers.forEach((t) => (map[t.tier] = { ...t, features_enabled: { ...t.features_enabled } }));
    setDraft(map);
  }, [tiers]);

  const updateField = (tier: TierKey, key: keyof TierRow, value: unknown) => {
    setDraft((prev) => (prev ? { ...prev, [tier]: { ...prev[tier], [key]: value } } : prev));
  };

  const toggleFeature = (tier: TierKey, feature: FeatureKey, value: boolean) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            [tier]: {
              ...prev[tier],
              features_enabled: { ...prev[tier].features_enabled, [feature]: value },
            },
          }
        : prev
    );
  };

  const [savingTier, setSavingTier] = useState<TierKey | null>(null);

  const saveTier = async (tier: TierKey) => {
    if (!draft) return;
    const row = draft[tier];
    setSavingTier(tier);
    const { error } = await supabase
      .from("tier_limits")
      .update({
        label: row.label,
        max_balance: row.max_balance,
        daily_limit: row.daily_limit,
        monthly_limit: row.monthly_limit,
        single_limit: row.single_limit,
        features_enabled: row.features_enabled,
      })
      .eq("tier", tier);
    setSavingTier(null);
    if (error) {
      toast.error(`Failed to save ${tier}: ${error.message}`);
      return;
    }
    toast.success(`${tier.replace("_", " ").toUpperCase()} saved`);
    qc.invalidateQueries({ queryKey: ["admin-tier-limits"] });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            KYC Tier Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Edit tier limits & feature gates, or override a specific user's tier. Changes apply to the user portal in real time.
          </p>
        </div>

        <Tabs defaultValue="limits" className="space-y-4">
          <TabsList>
            <TabsTrigger value="limits" className="gap-2">
              <Layers className="h-4 w-4" /> Tier Limits
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <UserCog className="h-4 w-4" /> User Tier Overrides
            </TabsTrigger>
          </TabsList>

          <TabsContent value="limits">
            <Card>
              <CardHeader>
                <CardTitle>Global Tier Limits</CardTitle>
                <CardDescription>
                  These limits are applied automatically when a user is approved to a tier. Changes here update every user
                  currently sitting on that tier on their next sync.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading || !draft ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Loading tiers…</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    {VISIBLE_TIERS.map((tier) => {
                      const row = draft[tier];
                      if (!row) return null;
                      const tierNum = tier.split("_")[1];
                      const limitFields = [
                        { k: "single_limit", label: "Single" },
                        { k: "daily_limit", label: "Daily" },
                        { k: "monthly_limit", label: "Monthly" },
                        { k: "max_balance", label: "Max balance" },
                      ] as const;
                      return (
                        <div key={tier} className="flex flex-col rounded-2xl border border-border bg-card p-5">
                          {/* Header */}
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-black text-foreground">
                              {tierNum}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-bold uppercase tracking-wide text-foreground">
                                Tier {tierNum}
                              </div>
                              <Input
                                value={row.label}
                                onChange={(e) => updateField(tier, "label", e.target.value)}
                                placeholder="Label"
                                className="mt-1 h-8 text-xs"
                              />
                            </div>
                          </div>

                          {/* Limits */}
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            {limitFields.map(({ k, label }) => (
                              <div key={k}>
                                <Label className="text-[11px] text-muted-foreground">{label}</Label>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  value={row[k]}
                                  onChange={(e) => updateField(tier, k, Number(e.target.value))}
                                  className="mt-1 h-9"
                                />
                              </div>
                            ))}
                          </div>

                          {/* Features */}
                          <div className="mt-4 space-y-1.5">
                            {FEATURE_KEYS.map((f) => (
                              <label
                                key={f}
                                className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-xs"
                              >
                                <span className="capitalize">{f.replace("_", " ")}</span>
                                <Switch
                                  checked={Boolean(row.features_enabled?.[f])}
                                  onCheckedChange={(v) => toggleFeature(tier, f, v)}
                                />
                              </label>
                            ))}
                          </div>

                          {/* Save */}
                          <Button
                            onClick={() => saveTier(tier)}
                            disabled={savingTier === tier}
                            className="mt-4 w-full gap-1.5"
                          >
                            {savingTier === tier ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            Save Tier {tierNum}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <UserTierOverrides tierDefaults={draft} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function UserTierOverrides({ tierDefaults }: { tierDefaults: Record<TierKey, TierRow> | null }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-user-tiers", debounced],
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("user_id, full_name, email, account_number, kyc_status")
        .order("created_at", { ascending: false })
        .limit(50);
      if (debounced) {
        q = q.or(
          `email.ilike.%${debounced}%,full_name.ilike.%${debounced}%,account_number.ilike.%${debounced}%`
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const userIds = useMemo(() => (users ?? []).map((u) => u.user_id), [users]);
  const { data: riskTiers } = useQuery({
    queryKey: ["admin-user-risk-tiers", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_risk_tiers")
        .select("user_id, current_tier")
        .in("user_id", userIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tierByUser = useMemo(() => {
    const m: Record<string, TierKey> = {};
    (riskTiers ?? []).forEach((r) => (m[r.user_id] = r.current_tier as TierKey));
    return m;
  }, [riskTiers]);

  const [savingUser, setSavingUser] = useState<string | null>(null);

  const updateUserTier = async (userId: string, tier: TierKey) => {
    if (!tierDefaults?.[tier]) {
      toast.error("Tier defaults not loaded yet");
      return;
    }
    const limits = tierDefaults[tier];
    setSavingUser(userId);
    const { error } = await supabase
      .from("user_risk_tiers")
      .upsert(
        {
          user_id: userId,
          current_tier: tier,
          daily_transaction_limit: limits.daily_limit,
          monthly_transaction_limit: limits.monthly_limit,
          single_transaction_limit: limits.single_limit,
          features_enabled: limits.features_enabled,
          upgraded_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    setSavingUser(null);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    toast.success(`Tier updated to ${tier.replace("_", " ").toUpperCase()}`);
    qc.invalidateQueries({ queryKey: ["admin-user-risk-tiers"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-User Tier Override</CardTitle>
        <CardDescription>
          Manually promote or demote a user. The user's limits and feature gates are automatically synced from the tier
          defaults above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or account #"
            className="pl-9"
          />
        </div>

        <TopScrollSync className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Account #</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead className="w-[180px]">Current Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Loading users…
                  </TableCell>
                </TableRow>
              ) : (users ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                (users ?? []).map((u) => {
                  const cur = tierByUser[u.user_id] ?? "tier_1";
                  return (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{u.account_number || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {u.kyc_status || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={cur}
                            onValueChange={(v) => updateUserTier(u.user_id, v as TierKey)}
                            disabled={savingUser === u.user_id}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VISIBLE_TIERS.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t.replace("_", " ").toUpperCase()}
                                  {tierDefaults?.[t]?.label ? ` · ${tierDefaults[t].label}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {savingUser === u.user_id && (
                            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TopScrollSync>
        <p className="text-xs text-muted-foreground">
          <Label className="text-xs">Note:</Label> Lowering a user's tier reduces their limits immediately. The user
          portal reflects the new tier within ~1 second.
        </p>
      </CardContent>
    </Card>
  );
}
