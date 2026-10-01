import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FALLBACK_SYSTEM_APIS, TESTABLE_SYSTEM_APIS } from "@/lib/systemApiCatalog";
import { normalizeProviderId } from "@/lib/systemApiRecords";
import { loadSystemApiProviders, removeSystemApi, saveSystemApi } from "@/lib/systemApiStore";
import { Eye, EyeOff, KeyRound, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type SystemApiField = {
  key: string;
  label: string;
  kind: "secret" | "public";
  env: string | null;
  configured: boolean;
  source: "saved" | "server" | "missing" | "default";
  hint: string | null;
  value: string | null;
  options?: string[];
};

export type SystemApiProvider = {
  provider: string;
  label: string;
  description: string;
  is_enabled: boolean;
  updated_at: string | null;
  custom?: boolean;
  fields: SystemApiField[];
};

type SystemApiList = { providers: SystemApiProvider[]; warning: string | null };

type Draft = {
  enabled: boolean;
  secrets: Record<string, string>;
  clear: Record<string, boolean>;
  publicConfig: Record<string, string>;
  show: Record<string, boolean>;
};

function emptyDraft(provider: SystemApiProvider): Draft {
  const publicConfig: Record<string, string> = {};
  for (const field of provider.fields) {
    if (field.kind === "public") publicConfig[field.key] = field.value || "";
  }
  return { enabled: provider.is_enabled, secrets: {}, clear: {}, publicConfig, show: {} };
}

function sourceLabel(field: SystemApiField): string {
  if (field.kind === "secret" && field.source === "saved") return field.hint ? `Saved ${field.hint}` : "Saved";
  if (field.kind === "secret" && field.source === "server") return "Using server secret";
  if (field.kind === "secret") return "Not set";
  if (field.source === "saved") return "Saved";
  return "Default";
}

async function loadProviders(): Promise<SystemApiList> {
  const providers = await loadSystemApiProviders();
  return { providers, warning: null };
}

export function SystemApiPanel({ preview }: { preview?: SystemApiProvider[] }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["system-api"],
    queryFn: loadProviders,
    enabled: !preview,
    retry: false,
  });
  const providers = preview ?? (query.data?.providers?.length ? query.data.providers : FALLBACK_SYSTEM_APIS);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!providers?.length) return;
    setDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const provider of providers) {
        if (!next[provider.provider]) {
          next[provider.provider] = emptyDraft(provider);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [providers]);

  const save = useMutation({
    mutationFn: async (provider: SystemApiProvider) => {
      const draft = drafts[provider.provider] || emptyDraft(provider);
      const secrets: Record<string, string> = {};
      const clearSecrets: string[] = [];
      for (const field of provider.fields) {
        if (field.kind !== "secret") continue;
        if (draft.clear[field.key]) clearSecrets.push(field.key);
        const value = (draft.secrets[field.key] || "").trim();
        if (value) secrets[field.key] = value;
      }
      const providers = await saveSystemApi({
        provider,
        enabled: draft.enabled,
        secrets,
        clearSecrets,
        publicConfig: draft.publicConfig,
      });
      return providers;
    },
    onSuccess: (list, provider) => {
      if (list.length) queryClient.setQueryData(["system-api"], { providers: list, warning: null });
      const fresh = list.find((item) => item.provider === provider.provider);
      if (fresh) {
        setDrafts((current) => ({ ...current, [provider.provider]: emptyDraft(fresh) }));
      }
      toast.success(`${provider.label} API saved`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testConnection = useMutation({
    mutationFn: async (provider: SystemApiProvider) => {
      const { data, error } = await supabase.functions.invoke("test-integration", {
        body: { provider: provider.provider },
      });
      if (error) throw new Error(error.message || "Test failed");
      return data as { ok?: boolean; message?: string };
    },
    onSuccess: (result, provider) => {
      if (result?.ok) toast.success(`${provider.label}: ${result.message || "connected"}`);
      else toast.warning(`${provider.label}: ${result?.message || "not connected"}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeApi = useMutation({
    mutationFn: async (provider: SystemApiProvider) => removeSystemApi(provider.provider),
    onSuccess: (list) => {
      if (list.length) queryClient.setQueryData(["system-api"], { providers: list, warning: null });
      toast.success("API removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const patch = (provider: string, update: (draft: Draft) => Draft) => {
    setDrafts((current) => {
      const base = current[provider];
      if (!base) return current;
      return { ...current, [provider]: update(base) };
    });
  };

  const providerList = providers ?? [];
  const loadError = !preview && query.isError ? (query.error instanceof Error ? query.error.message : "Could not load saved API settings") : "";
  const warning = !preview && !loadError ? query.data?.warning || "" : "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              System API
            </CardTitle>
            <Button type="button" size="sm" onClick={() => setAddOpen(true)} disabled={Boolean(preview)}>
              <Plus className="mr-2 h-4 w-4" />
              Add API
            </Button>
          </div>
          <CardDescription>
            Update the keys Alice, Plaid, and Resend use, or add another API.
            A saved key replaces the server secret. Leave a secret blank to keep the current one.
            Turning a system off stops it, even when a server secret is still present.
          </CardDescription>
        </CardHeader>
        {(loadError || warning || (!preview && query.isFetching && !query.data)) && (
          <CardContent className="space-y-3 pt-0">
            {!preview && query.isFetching && !query.data && (
              <p className="text-sm text-muted-foreground">Checking saved keys…</p>
            )}
            {loadError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                <span>{loadError}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>Try again</Button>
              </div>
            )}
            {warning && <p className="text-sm text-muted-foreground">{warning}</p>}
          </CardContent>
        )}
      </Card>

      {providerList.map((provider) => {
        const draft = drafts[provider.provider] || emptyDraft(provider);
        const saving = save.isPending && save.variables?.provider === provider.provider;
        const testing = testConnection.isPending && testConnection.variables?.provider === provider.provider;
        return (
          <Card key={provider.provider} id={`system-api-${provider.provider}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{provider.label}</CardTitle>
                  <CardDescription className="mt-1">{provider.description}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`${provider.provider}-enabled`} className="text-xs text-muted-foreground">
                    {draft.enabled ? "Enabled" : "Disabled"}
                  </Label>
                  <Switch
                    id={`${provider.provider}-enabled`}
                    checked={draft.enabled}
                    onCheckedChange={(checked) => patch(provider.provider, (d) => ({ ...d, enabled: checked }))}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {provider.fields.map((field) => {
                const inputId = `${provider.provider}-${field.key}`;
                if (field.kind === "public" && field.options) {
                  return (
                    <div key={field.key} className="space-y-2 max-w-xs">
                      <Label htmlFor={inputId}>{field.label}</Label>
                      <Select
                        value={draft.publicConfig[field.key] || field.value || field.options[0]}
                        onValueChange={(value) => patch(provider.provider, (d) => ({
                          ...d,
                          publicConfig: { ...d.publicConfig, [field.key]: value },
                        }))}
                      >
                        <SelectTrigger id={inputId}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                if (field.kind === "public") {
                  return (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={inputId}>{field.label}</Label>
                        <Badge variant="outline">{sourceLabel(field)}</Badge>
                      </div>
                      <Input
                        id={inputId}
                        value={draft.publicConfig[field.key] ?? ""}
                        placeholder={field.key === "from" ? "eFinMoney <noreply@efinsuite.com>" : ""}
                        onChange={(e) => patch(provider.provider, (d) => ({
                          ...d,
                          publicConfig: { ...d.publicConfig, [field.key]: e.target.value },
                        }))}
                      />
                    </div>
                  );
                }
                const shown = draft.show[field.key] === true;
                return (
                  <div key={field.key} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={inputId}>{field.label}</Label>
                      <Badge variant="outline">{sourceLabel(field)}</Badge>
                      {field.env && <span className="font-mono text-[11px] text-muted-foreground">{field.env}</span>}
                    </div>
                    <div className="relative max-w-xl">
                      <Input
                        id={inputId}
                        type={shown ? "text" : "password"}
                        autoComplete="off"
                        className="pr-10 font-mono"
                        placeholder={field.source === "saved" ? "Leave blank to keep the saved key" : "Paste a new key"}
                        value={draft.secrets[field.key] || ""}
                        onChange={(e) => patch(provider.provider, (d) => ({
                          ...d,
                          secrets: { ...d.secrets, [field.key]: e.target.value },
                        }))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0"
                        aria-label={shown ? `Hide ${field.label}` : `Show ${field.label}`}
                        onClick={() => patch(provider.provider, (d) => ({
                          ...d,
                          show: { ...d.show, [field.key]: !shown },
                        }))}
                      >
                        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {field.source === "saved" && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={draft.clear[field.key] === true}
                          onChange={(e) => patch(provider.provider, (d) => ({
                            ...d,
                            clear: { ...d.clear, [field.key]: e.target.checked },
                          }))}
                        />
                        Remove the saved key and use the server secret
                      </label>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" onClick={() => save.mutate(provider)} disabled={saving || Boolean(preview)}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save {provider.label}
                </Button>
                {TESTABLE_SYSTEM_APIS.has(provider.provider) && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testing || Boolean(preview)}
                    onClick={() => testConnection.mutate(provider)}
                  >
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Test connection
                  </Button>
                )}
                {provider.custom && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={removeApi.isPending || Boolean(preview)}
                    onClick={() => {
                      if (window.confirm(`Remove ${provider.label}? Saved keys for this API will be deleted.`)) {
                        removeApi.mutate(provider);
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <AddSystemApiDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(list, warningText) => {
          if (list.length) queryClient.setQueryData(["system-api"], { providers: list, warning: warningText });
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function AddSystemApiDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (providers: SystemApiProvider[], warning: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [providerId, setProviderId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [secrets, setSecrets] = useState([{ label: "API key", value: "" }]);
  const [settings, setSettings] = useState<{ label: string; value: string }[]>([]);

  const reset = () => {
    setLabel("");
    setProviderId("");
    setIdEdited(false);
    setDescription("");
    setSecrets([{ label: "API key", value: "" }]);
    setSettings([]);
  };

  const create = useMutation({
    mutationFn: async () => {
      const used = new Set<string>();
      const secretFields = secrets
        .map((field) => ({ label: field.label.trim(), value: field.value }))
        .filter((field) => field.label);
      const publicFields = settings
        .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
        .filter((field) => field.label);
      if (!label.trim()) throw new Error("Enter a name for the API");
      if (!secretFields.length) throw new Error("Add at least one key");
      const keyFor = (name: string, fallback: string) => {
        let key = normalizeProviderId(name) || fallback;
        const base = key;
        let n = 2;
        while (used.has(key)) key = `${base}_${n++}`.slice(0, 40);
        used.add(key);
        return key;
      };
      const definition = {
        secrets: secretFields.map((field, index) => ({
          key: keyFor(field.label, index === 0 ? "api_key" : "secret"),
          label: field.label,
        })),
        publicFields: publicFields.map((field) => ({
          key: keyFor(field.label, "setting"),
          label: field.label,
        })),
      };
      const secretValues: Record<string, string> = {};
      definition.secrets.forEach((field, index) => {
        const value = secretFields[index]?.value.trim();
        if (value) secretValues[field.key] = value;
      });
      const publicConfig: Record<string, string> = {};
      definition.publicFields.forEach((field, index) => {
        const value = publicFields[index]?.value || "";
        if (value) publicConfig[field.key] = value;
      });
      const id = providerId || normalizeProviderId(label);
      const provider: SystemApiProvider = {
        provider: id,
        label: label.trim(),
        description: description.trim(),
        is_enabled: true,
        updated_at: null,
        custom: !["gemini", "plaid", "resend"].includes(id),
        fields: [
          ...definition.secrets.map((field) => ({
            key: field.key,
            label: field.label,
            kind: "secret" as const,
            env: null,
            configured: false,
            source: "missing" as const,
            hint: null,
            value: null,
          })),
          ...definition.publicFields.map((field) => ({
            key: field.key,
            label: field.label,
            kind: "public" as const,
            env: null,
            configured: Boolean(publicConfig[field.key]),
            source: "saved" as const,
            hint: null,
            value: publicConfig[field.key] || "",
          })),
        ],
      };
      return saveSystemApi({
        provider,
        enabled: true,
        secrets: secretValues,
        clearSecrets: [],
        publicConfig,
      });
    },
    onSuccess: (providers) => {
      toast.success(`${label.trim() || "API"} added`);
      onCreated(providers, null);
      reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add API</DialogTitle>
          <DialogDescription>
            Store the keys for another system. Saved keys stay on the server and are not shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="new-api-name">Name</Label>
            <Input
              id="new-api-name"
              value={label}
              placeholder="Stripe"
              onChange={(e) => {
                const next = e.target.value;
                setLabel(next);
                if (!idEdited) setProviderId(normalizeProviderId(next));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-api-id">ID</Label>
            <Input
              id="new-api-id"
              value={providerId}
              className="font-mono"
              placeholder="stripe"
              onChange={(e) => {
                setIdEdited(true);
                setProviderId(normalizeProviderId(e.target.value));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-api-description">Description</Label>
            <Input
              id="new-api-description"
              value={description}
              placeholder="What this API is used for"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {secrets.map((field, index) => (
            <div key={`secret-${index}`} className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`new-secret-label-${index}`}>Key name</Label>
                <Input
                  id={`new-secret-label-${index}`}
                  value={field.label}
                  onChange={(e) => setSecrets((current) => current.map((item, i) => i === index ? { ...item, label: e.target.value } : item))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`new-secret-value-${index}`}>Key</Label>
                <Input
                  id={`new-secret-value-${index}`}
                  type="password"
                  autoComplete="off"
                  className="font-mono"
                  placeholder="Paste a key"
                  value={field.value}
                  onChange={(e) => setSecrets((current) => current.map((item, i) => i === index ? { ...item, value: e.target.value } : item))}
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setSecrets((current) => [...current, { label: "", value: "" }])}>
            <Plus className="mr-2 h-4 w-4" />
            Add another key
          </Button>
          {settings.map((field, index) => (
            <div key={`setting-${index}`} className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`new-setting-label-${index}`}>Setting</Label>
                <Input
                  id={`new-setting-label-${index}`}
                  value={field.label}
                  placeholder="Base URL"
                  onChange={(e) => setSettings((current) => current.map((item, i) => i === index ? { ...item, label: e.target.value } : item))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`new-setting-value-${index}`}>Value</Label>
                <Input
                  id={`new-setting-value-${index}`}
                  value={field.value}
                  onChange={(e) => setSettings((current) => current.map((item, i) => i === index ? { ...item, value: e.target.value } : item))}
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setSettings((current) => [...current, { label: "", value: "" }])}>
            <Plus className="mr-2 h-4 w-4" />
            Add a setting
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add API
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
