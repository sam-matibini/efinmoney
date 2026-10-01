import assert from "node:assert/strict";
import {
  buildProviderView,
  mergeSecrets,
  normalizePublicConfig,
  secretHint,
  systemApiDef,
} from "../supabase/functions/_shared/systemApiLogic.ts";

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

console.log("system api checks passed");
