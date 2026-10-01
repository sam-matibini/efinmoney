// Admin System API settings. Lists Gemini, Plaid, and Resend without returning
// secret values, and saves replacements that edge functions read ahead of server secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  SYSTEM_API_CATALOG,
  buildProviderView,
  isSystemApiProvider,
  mergeSecrets,
  normalizePublicConfig,
  systemApiDef,
} from "../_shared/systemApiLogic.ts";
import { clearSystemApiCache, envHas } from "../_shared/systemApi.ts";

type Any = Record<string, unknown>;

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
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
    const action = body.action === "save" ? "save" : "list";

    if (action === "save") {
      const provider = String(body.provider || "");
      const def = systemApiDef(provider);
      if (!def || !isSystemApiProvider(provider)) {
        return jsonResponse({ error: "Unknown system API" }, 400);
      }

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

      const { error: upErr } = await admin.from("system_api_providers").upsert({
        provider,
        label: def.label,
        description: def.description,
        is_enabled: isEnabled,
        public_config: publicConfig,
        updated_at: now,
        updated_by: user.id,
      }, { onConflict: "provider" });
      if (upErr) return jsonResponse({ error: upErr.message }, 500);

      const { error: secretErr } = await admin.from("system_api_secrets").upsert({
        provider,
        secrets,
        updated_at: now,
      }, { onConflict: "provider" });
      if (secretErr) return jsonResponse({ error: secretErr.message }, 500);

      clearSystemApiCache(provider);
    }

    const { data: rows, error: listErr } = await admin
      .from("system_api_providers")
      .select("provider, is_enabled, public_config, updated_at");
    if (listErr) return jsonResponse({ error: listErr.message }, 500);

    const { data: secretRows, error: secretsErr } = await admin
      .from("system_api_secrets")
      .select("provider, secrets");
    if (secretsErr) return jsonResponse({ error: secretsErr.message }, 500);

    const byProvider = new Map((rows || []).map((r) => [r.provider, r]));
    const secretsByProvider = new Map((secretRows || []).map((r) => [r.provider, asRecord(r.secrets)]));

    const providers = SYSTEM_API_CATALOG.map((def) => {
      const row = byProvider.get(def.provider);
      return buildProviderView(
        def,
        row
          ? {
            is_enabled: row.is_enabled !== false,
            public_config: asRecord(row.public_config),
            updated_at: row.updated_at ?? null,
          }
          : null,
        secretsByProvider.get(def.provider) || {},
        envHas,
      );
    });

    return jsonResponse({ ok: true, providers });
  } catch (err) {
    console.error("system-api", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Could not update system APIs" }, 500);
  }
});
