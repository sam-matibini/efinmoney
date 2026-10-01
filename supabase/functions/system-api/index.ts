// Admin System API settings. Lists Gemini, Plaid, and Resend without returning
// secret values, and saves replacements that edge functions read ahead of server secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  SYSTEM_API_CATALOG,
  buildProviderView,
  defFromStoredSchema,
  isBuiltinSystemApi,
  mergeSecrets,
  normalizePublicConfig,
  parseCustomDefinition,
  systemApiDef,
  type SystemApiDef,
} from "../_shared/systemApiLogic.ts";
import { clearSystemApiCache, envHas } from "../_shared/systemApi.ts";

type Any = Record<string, unknown>;

function isMissingStorage(message: string): boolean {
  return /does not exist|schema cache|could not find the table|could not find the column/i.test(message);
}

function storageError(message: string): string {
  if (/field_schema/i.test(message)) {
    return "Adding an API needs the latest database update. Gemini, Plaid, and Resend can still be edited.";
  }
  if (isMissingStorage(message)) {
    return "System API storage is not ready yet. Reload after the latest database update is applied.";
  }
  return message;
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

async function listProviders(admin: ReturnType<typeof createClient>) {
  let warning: string | null = null;
  let rows: Array<Record<string, unknown>> = [];
  const full = await admin
    .from("system_api_providers")
    .select("provider, label, description, is_enabled, public_config, field_schema, updated_at");
  if (full.error) {
    const message = full.error.message || "";
    if (isMissingStorage(message) && /field_schema|column/i.test(message)) {
      const plain = await admin
        .from("system_api_providers")
        .select("provider, label, description, is_enabled, public_config, updated_at");
      if (plain.error) {
        if (!isMissingStorage(plain.error.message || "")) {
          return { providers: [], warning: null, error: plain.error.message };
        }
        warning = "Saved keys are not available yet. You can still review Gemini, Plaid, and Resend.";
      } else {
        rows = (plain.data || []) as Array<Record<string, unknown>>;
      }
    } else if (isMissingStorage(message)) {
      warning = "Saved keys are not available yet. You can still review Gemini, Plaid, and Resend.";
    } else {
      return { providers: [], warning: null, error: message };
    }
  } else {
    rows = (full.data || []) as Array<Record<string, unknown>>;
  }

  let secretRows: Array<Record<string, unknown>> = [];
  if (!warning) {
    const secrets = await admin.from("system_api_secrets").select("provider, secrets");
    if (secrets.error) {
      if (!isMissingStorage(secrets.error.message || "")) {
        return { providers: [], warning: null, error: secrets.error.message };
      }
      warning = "Saved keys are not available yet. You can still review Gemini, Plaid, and Resend.";
    } else {
      secretRows = (secrets.data || []) as Array<Record<string, unknown>>;
    }
  }

  const byProvider = new Map(rows.map((row) => [String(row.provider), row]));
  const secretsByProvider = new Map(secretRows.map((row) => [String(row.provider), asRecord(row.secrets)]));
  const providers = SYSTEM_API_CATALOG.map((def) => {
    const row = byProvider.get(def.provider);
    return buildProviderView(
      def,
      row
        ? {
          is_enabled: row.is_enabled !== false,
          public_config: asRecord(row.public_config),
          updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
        }
        : null,
      secretsByProvider.get(def.provider) || {},
      envHas,
    );
  });

  for (const row of rows) {
    const id = String(row.provider || "");
    if (!id || isBuiltinSystemApi(id)) continue;
    const label = typeof row.label === "string" && row.label.trim() ? row.label : id;
    const description = typeof row.description === "string" ? row.description : "";
    let def = defFromStoredSchema(id, label, description, row.field_schema);
    if (!def) {
      try {
        def = parseCustomDefinition({
          provider: id,
          label,
          description,
          definition: { secrets: [{ key: "api_key", label: "API key" }] },
        });
      } catch {
        continue;
      }
    }
    providers.push(buildProviderView(
      def,
      {
        is_enabled: row.is_enabled !== false,
        public_config: asRecord(row.public_config),
        updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
      },
      secretsByProvider.get(id) || {},
      envHas,
    ));
  }

  return { providers, warning, error: null as string | null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: { user }, error: authErr } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const [{ data: portalAdmin }, { data: legacyAdmin }] = await Promise.all([
      admin.rpc("is_admin_user", { _uid: user.id }),
      admin.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    ]);
    if (!portalAdmin && !legacyAdmin) return jsonResponse({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({})) as Any;
    const action = body.action === "save" || body.action === "create" || body.action === "remove"
      ? body.action
      : "list";

    if (action === "remove") {
      const provider = String(body.provider || "").trim().toLowerCase();
      if (isBuiltinSystemApi(provider)) {
        return jsonResponse({ error: "Built-in APIs stay on this page" }, 400);
      }
      const { error: secretDel } = await admin.from("system_api_secrets").delete().eq("provider", provider);
      if (secretDel && !isMissingStorage(secretDel.message)) {
        return jsonResponse({ error: secretDel.message }, 500);
      }
      const { error: delErr } = await admin.from("system_api_providers").delete().eq("provider", provider);
      if (delErr) return jsonResponse({ error: storageError(delErr.message) }, 500);
      clearSystemApiCache(provider);
    }

    if (action === "save" || action === "create") {
      const provider = String(body.provider || "").trim().toLowerCase();
      let def: SystemApiDef | null = systemApiDef(provider);
      if (action === "create") {
        try {
          def = parseCustomDefinition(body);
        } catch (err) {
          return jsonResponse({ error: err instanceof Error ? err.message : "Invalid API" }, 400);
        }
        const { data: existing, error: existsErr } = await admin
          .from("system_api_providers")
          .select("provider")
          .eq("provider", def.provider)
          .maybeSingle();
        if (existsErr) return jsonResponse({ error: storageError(existsErr.message) }, 500);
        if (existing) return jsonResponse({ error: "That API is already on this page" }, 400);
      } else if (!def) {
        const { data: stored, error: storedErr } = await admin
          .from("system_api_providers")
          .select("label, description, field_schema")
          .eq("provider", provider)
          .maybeSingle();
        if (storedErr) return jsonResponse({ error: storageError(storedErr.message) }, 500);
        def = stored
          ? defFromStoredSchema(provider, stored.label, stored.description || "", stored.field_schema)
            || parseCustomDefinition({
              provider,
              label: stored.label,
              description: stored.description,
              definition: { secrets: [{ key: "api_key", label: "API key" }] },
            })
          : null;
        if (!def) return jsonResponse({ error: "Unknown system API" }, 400);
      }
      if (!def) return jsonResponse({ error: "Unknown system API" }, 400);

      const { data: existingProvider, error: readErr } = await admin
        .from("system_api_providers")
        .select("public_config, is_enabled")
        .eq("provider", provider)
        .maybeSingle();
      if (readErr) return jsonResponse({ error: readErr.message }, 500);

      const { data: existingSecret } = await admin
        .from("system_api_secrets")
        .select("secrets")
        .eq("provider", provider)
        .maybeSingle();

      const clear = Array.isArray(body.clear_secrets)
        ? body.clear_secrets.map((k) => String(k))
        : [];
      let secrets: Record<string, string>;
      let publicConfig: Record<string, string>;
      try {
        secrets = mergeSecrets(
          asRecord(existingSecret?.secrets),
          (body.secrets && typeof body.secrets === "object") ? body.secrets as Record<string, unknown> : {},
          clear,
          def.secrets.map((f) => f.key),
        );
        publicConfig = normalizePublicConfig(
          def,
          (body.public_config && typeof body.public_config === "object")
            ? body.public_config as Record<string, unknown>
            : {},
          asRecord(existingProvider?.public_config),
        );
      } catch (err) {
        return jsonResponse({ error: err instanceof Error ? err.message : "Invalid settings" }, 400);
      }

      const isEnabled = typeof body.is_enabled === "boolean"
        ? body.is_enabled
        : existingProvider?.is_enabled !== false;
      const now = new Date().toISOString();

      const providerRow: Record<string, unknown> = {
        provider: def.provider,
        label: def.label,
        description: def.description,
        is_enabled: isEnabled,
        public_config: publicConfig,
        updated_at: now,
        updated_by: user.id,
      };
      if (!isBuiltinSystemApi(def.provider)) {
        providerRow.field_schema = {
          secrets: def.secrets.map((field) => ({ key: field.key, label: field.label, env: field.env })),
          publicFields: def.publicFields.map((field) => ({
            key: field.key,
            label: field.label,
            defaultValue: field.defaultValue,
            options: field.options,
          })),
        };
      }
      const { error: upErr } = await admin.from("system_api_providers").upsert(providerRow, { onConflict: "provider" });
      if (upErr) return jsonResponse({ error: storageError(upErr.message) }, 500);

      const { error: secretErr } = await admin.from("system_api_secrets").upsert({
        provider: def.provider,
        secrets,
        updated_at: now,
      }, { onConflict: "provider" });
      if (secretErr) return jsonResponse({ error: secretErr.message }, 500);

      clearSystemApiCache(def.provider);
    }

    const listed = await listProviders(admin);
    if (listed.error) return jsonResponse({ error: listed.error }, 500);
    return jsonResponse({ ok: true, providers: listed.providers, warning: listed.warning });
  } catch (err) {
    console.error("system-api", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Could not update system APIs" }, 500);
  }
});
