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
import { Eye, EyeOff, KeyRound, Loader2, Save } from "lucide-react";
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
  fields: SystemApiField[];
};

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

async function loadProviders(): Promise<SystemApiProvider[]> {
  const { data, error } = await supabase.functions.invoke("system-api", { body: { action: "list" } });
  if (error) throw new Error(error.message || "Could not load system APIs");
  if (data?.error) throw new Error(String(data.error));
  return (data?.providers || []) as SystemApiProvider[];
}

export function SystemApiPanel({ preview }: { preview?: SystemApiProvider[] }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["system-api"],
    queryFn: loadProviders,
    enabled: !preview,
  });
  const providers = preview ?? query.data;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

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
      const { data, error } = await supabase.functions.invoke("system-api", {
        body: {
          action: "save",
          provider: provider.provider,
          is_enabled: draft.enabled,
          secrets,
          clear_secrets: clearSecrets,
          public_config: draft.publicConfig,
        },
      });
      if (error) throw new Error(error.message || "Could not save");
      if (data?.error) throw new Error(String(data.error));
      return data;
    },
    onSuccess: (data, provider) => {
      const list = (data?.providers || []) as SystemApiProvider[];
      if (list.length) queryClient.setQueryData(["system-api"], list);
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

  const patch = (provider: string, update: (draft: Draft) => Draft) => {
    setDrafts((current) => {
      const base = current[provider];
      if (!base) return current;
      return { ...current, [provider]: update(base) };
    });
  };

  const providerList = providers ?? [];

  if (!preview && query.isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">Loading system APIs…</CardContent>
      </Card>
    );
  }

  if (!preview && query.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System API</CardTitle>
          <CardDescription>Could not load API settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => query.refetch()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            System API
          </CardTitle>
          <CardDescription>
            Update the keys Alice, Plaid, and Resend use. A saved key replaces the server secret.
            Leave a secret blank to keep the current one. Turning a system off stops it, even when a server secret is still present.
          </CardDescription>
        </CardHeader>
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={testing || Boolean(preview)}
                  onClick={() => testConnection.mutate(provider)}
                >
                  {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Test connection
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
