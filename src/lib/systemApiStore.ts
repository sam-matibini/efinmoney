import { supabase } from "@/integrations/supabase/client";
import type { SystemApiProvider } from "@/components/admin/SystemApiPanel";
import { FALLBACK_SYSTEM_APIS } from "@/lib/systemApiCatalog";
import {
  SYSTEM_API_KEY_PREFIX,
  assertProviderId,
  mergeSavedSecrets,
  mergeSystemApiRows,
  readStoredConfig,
  systemApiRowKey,
  type StoredSystemApiRow,
} from "@/lib/systemApiRecords";

function toError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message || fallback);
}

export async function loadSystemApiProviders(): Promise<SystemApiProvider[]> {
  const { data, error } = await supabase
    .from("integration_settings")
    .select("key, is_enabled, config, updated_at")
    .like("key", `${SYSTEM_API_KEY_PREFIX}%`);
  if (error) throw toError(error, "Could not load system APIs");
  return mergeSystemApiRows(FALLBACK_SYSTEM_APIS, (data || []) as StoredSystemApiRow[]);
}

async function writeProvider(input: {
  provider: SystemApiProvider;
  enabled: boolean;
  secrets: Record<string, string>;
  clearSecrets: string[];
  publicConfig: Record<string, string>;
}): Promise<SystemApiProvider[]> {
  const id = assertProviderId(input.provider.provider);
  const key = systemApiRowKey(id);
  const { data: existing, error: readErr } = await supabase
    .from("integration_settings")
    .select("config")
    .eq("key", key)
    .maybeSingle();
  if (readErr) throw toError(readErr, "Could not read the saved API");
  const previous = readStoredConfig(existing?.config);
  const secrets = mergeSavedSecrets(previous.secrets || {}, input.secrets, input.clearSecrets);
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("integration_settings").upsert({
    key,
    is_enabled: input.enabled,
    config: {
      label: input.provider.label,
      description: input.provider.description,
      public_config: input.publicConfig,
      secrets,
      fields: {
        secrets: input.provider.fields
          .filter((field) => field.kind === "secret")
          .map((field) => ({ key: field.key, label: field.label, env: field.env })),
        publicFields: input.provider.fields
          .filter((field) => field.kind === "public")
          .map((field) => ({
            key: field.key,
            label: field.label,
            defaultValue: field.value || "",
            options: field.options,
          })),
      },
    },
    updated_at: new Date().toISOString(),
    updated_by: userData.user?.id ?? null,
  }, { onConflict: "key" });
  if (error) throw toError(error, "Could not save this API");
  return loadSystemApiProviders();
}

export function saveSystemApi(input: {
  provider: SystemApiProvider;
  enabled: boolean;
  secrets: Record<string, string>;
  clearSecrets: string[];
  publicConfig: Record<string, string>;
}): Promise<SystemApiProvider[]> {
  return writeProvider(input);
}

export async function removeSystemApi(provider: string): Promise<SystemApiProvider[]> {
  const key = systemApiRowKey(provider);
  const { error } = await supabase.from("integration_settings").delete().eq("key", key);
  if (error) throw toError(error, "Could not remove this API");
  return loadSystemApiProviders();
}
