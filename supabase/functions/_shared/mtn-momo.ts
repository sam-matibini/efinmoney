// Shared helper for MTN MoMo Sandbox (Remittances product).
// Handles API User / API Key provisioning + Bearer token retrieval.
//
// Credentials are cached in the `integration_settings` table under key `mtn_momo`.
// Shape of config:
// {
//   environment: "sandbox" | "mtnghana" | "mtnzambia" | "mtnuganda",
//   api_user: "<uuid>",
//   api_key: "<provisioned key>",
//   provisioned_at: "<iso>"
// }

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const MTN_BASE_URL =
  Deno.env.get("MTN_MOMO_BASE_URL") || "https://sandbox.momodeveloper.mtn.com";

export const MTN_TARGET_ENV =
  Deno.env.get("MTN_MOMO_TARGET_ENV") || "sandbox";

export const MTN_CALLBACK_HOST =
  Deno.env.get("MTN_MOMO_CALLBACK_HOST") ||
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/mtn-momo-webhook`;

interface MtnConfig {
  api_user?: string;
  api_key?: string;
  environment?: string;
  provisioned_at?: string;
}

function getPrimaryKey(): string {
  const k = Deno.env.get("MTN_MOMO_PRIMARY_KEY");
  if (!k) throw new Error("MTN_MOMO_PRIMARY_KEY not configured");
  return k;
}

async function loadConfig(supabase: SupabaseClient): Promise<MtnConfig> {
  const { data } = await supabase
    .from("integration_settings")
    .select("config")
    .eq("key", "mtn_momo")
    .maybeSingle();
  return (data?.config as MtnConfig) || {};
}

async function saveConfig(supabase: SupabaseClient, cfg: MtnConfig) {
  const { data: existing } = await supabase
    .from("integration_settings")
    .select("id")
    .eq("key", "mtn_momo")
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("integration_settings")
      .update({ config: cfg, is_enabled: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("integration_settings")
      .insert({ key: "mtn_momo", config: cfg, is_enabled: true });
  }
}

async function provisionApiUser(): Promise<{ apiUser: string; apiKey: string }> {
  const primaryKey = getPrimaryKey();
  const apiUser = crypto.randomUUID();

  // 1) Create API user
  const createRes = await fetch(`${MTN_BASE_URL}/v1_0/apiuser`, {
    method: "POST",
    headers: {
      "X-Reference-Id": apiUser,
      "Ocp-Apim-Subscription-Key": primaryKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ providerCallbackHost: MTN_CALLBACK_HOST }),
  });
  if (!createRes.ok && createRes.status !== 201) {
    const txt = await createRes.text();
    throw new Error(`MTN apiuser provisioning failed (${createRes.status}): ${txt}`);
  }

  // 2) Create API key for that user
  const keyRes = await fetch(`${MTN_BASE_URL}/v1_0/apiuser/${apiUser}/apikey`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": primaryKey },
  });
  if (!keyRes.ok) {
    const txt = await keyRes.text();
    throw new Error(`MTN apikey provisioning failed (${keyRes.status}): ${txt}`);
  }
  const keyJson = await keyRes.json();
  const apiKey = keyJson.apiKey as string;
  if (!apiKey) throw new Error("MTN apikey response missing apiKey");

  return { apiUser, apiKey };
}

export async function ensureApiCredentials(
  supabase: SupabaseClient,
): Promise<{ apiUser: string; apiKey: string }> {
  const cfg = await loadConfig(supabase);
  if (cfg.api_user && cfg.api_key) {
    return { apiUser: cfg.api_user, apiKey: cfg.api_key };
  }
  const { apiUser, apiKey } = await provisionApiUser();
  await saveConfig(supabase, {
    ...cfg,
    api_user: apiUser,
    api_key: apiKey,
    environment: MTN_TARGET_ENV,
    provisioned_at: new Date().toISOString(),
  });
  return { apiUser, apiKey };
}

export async function getRemittanceToken(supabase: SupabaseClient): Promise<string> {
  const primaryKey = getPrimaryKey();
  const { apiUser, apiKey } = await ensureApiCredentials(supabase);
  const basic = btoa(`${apiUser}:${apiKey}`);

  const res = await fetch(`${MTN_BASE_URL}/remittance/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Ocp-Apim-Subscription-Key": primaryKey,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MTN remittance token failed (${res.status}): ${txt}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("MTN token response missing access_token");
  return json.access_token as string;
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function mtnPrimaryKey(): string {
  return getPrimaryKey();
}
