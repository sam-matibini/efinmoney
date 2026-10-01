import assert from "node:assert/strict";
import {
  buildProviderView,
  mergeSecrets,
  normalizePublicConfig,
  parseCustomDefinition,
  secretHint,
  systemApiDef,
} from "../supabase/functions/_shared/systemApiLogic.ts";
import { FALLBACK_SYSTEM_APIS } from "../src/lib/systemApiCatalog.ts";
import { assertProviderId, mergeSystemApiRows, secretHint as clientHint } from "../src/lib/systemApiRecords.ts";

assert.equal(secretHint(""), null);
assert.equal(secretHint("abcd"), "••••");
assert.equal(secretHint("sk-live-1234abcd"), "••••abcd");

const plaid = systemApiDef("plaid");
assert.ok(plaid);
const merged = mergeSecrets(
  { client_id: "old-client", secret: "old-secret" },
  { secret: "  new-secret  ", client_id: "" },
  ["monitor_program_id"],
  plaid.secrets.map((f) => f.key),
);
assert.equal(merged.secret, "new-secret");
assert.equal(merged.client_id, "old-client");
assert.equal(merged.monitor_program_id, undefined);

const cleared = mergeSecrets(
  { api_key: "keep-me-9999" },
  { api_key: "" },
  ["api_key"],
  ["api_key"],
);
assert.equal(cleared.api_key, undefined);

const gemini = systemApiDef("gemini");
assert.ok(gemini);
const pub = normalizePublicConfig(gemini, { model: "gemini-2.5-flash" }, {});
assert.equal(pub.model, "gemini-2.5-flash");
assert.throws(() => normalizePublicConfig(gemini, { model: "bad model" }, {}));
assert.throws(() => normalizePublicConfig(plaid, { env: "staging" }, { env: "production" }));

const view = buildProviderView(
  gemini,
  { is_enabled: true, public_config: { model: "gemini-2.5-flash" }, updated_at: null },
  { api_key: "AIza-secret-key-wxyz" },
  () => false,
);
const keyField = view.fields.find((f) => f.key === "api_key");
assert.equal(keyField?.source, "saved");
assert.equal(keyField?.hint, "••••wxyz");
assert.equal(keyField?.value, null);
const modelField = view.fields.find((f) => f.key === "model");
assert.equal(modelField?.value, "gemini-2.5-flash");

const serverOnly = buildProviderView(
  systemApiDef("resend")!,
  null,
  {},
  (name) => name === "RESEND_API_KEY",
);
const resendKey = serverOnly.fields.find((f) => f.key === "api_key");
assert.equal(resendKey?.source, "server");
assert.equal(resendKey?.hint, null);
assert.equal(resendKey?.configured, true);

const disabled = buildProviderView(
  gemini,
  { is_enabled: false, public_config: {}, updated_at: null },
  { api_key: "saved-key-zzzz" },
  () => true,
);
assert.equal(disabled.is_enabled, false);
assert.equal(disabled.fields.find((f) => f.key === "api_key")?.configured, false);
assert.equal(disabled.custom, false);

const stripe = parseCustomDefinition({
  provider: "Stripe",
  label: "Stripe",
  description: "Card payments",
  definition: {
    secrets: [{ label: "Secret key" }, { label: "Webhook secret" }],
    publicFields: [{ label: "Account" }],
  },
});
assert.equal(stripe.provider, "stripe");
assert.equal(stripe.secrets[0].key, "api_key");
assert.equal(stripe.secrets[1].key, "api_key_2");
assert.equal(stripe.publicFields[0].key, "setting");
assert.throws(() => parseCustomDefinition({ provider: "gemini", label: "Gemini" }));
assert.equal(parseCustomDefinition({ provider: "909681129488", label: "Google Gemini" }).provider, "909681129488");
assert.equal(assertProviderId("909681129488"), "909681129488");

const mergedRows = mergeSystemApiRows(FALLBACK_SYSTEM_APIS, [{
  key: "system_api:909681129488",
  is_enabled: true,
  updated_at: null,
  config: {
    label: "Google Gemini",
    description: "Alice",
    secrets: { api_key: "AIza-live-key-9488" },
    fields: { secrets: [{ key: "api_key", label: "API key" }] },
  },
}]);
const added = mergedRows.find((item) => item.provider === "909681129488");
assert.ok(added);
assert.equal(added?.custom, true);
assert.equal(added?.fields[0].hint, clientHint("AIza-live-key-9488"));
assert.equal(JSON.stringify(added).includes("AIza-live-key-9488"), false);
assert.equal(mergedRows.filter((item) => item.provider === "gemini").length, 1);

for (const def of [systemApiDef("gemini")!, systemApiDef("plaid")!, systemApiDef("resend")!]) {
  const view = buildProviderView(def, null, {}, () => false);
  const fallback = FALLBACK_SYSTEM_APIS.find((item) => item.provider === def.provider);
  assert.ok(fallback, def.provider);
  assert.deepEqual(fallback.fields.map((field) => field.key), view.fields.map((field) => field.key));
  assert.equal(fallback.custom, false);
}

console.log("system api checks passed");
