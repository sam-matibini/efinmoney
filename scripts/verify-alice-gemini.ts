import assert from "node:assert/strict";
import { isMissingGeminiError, pickSavedGemini, shouldUseSavedGemini } from "../src/lib/aliceGeminiKey.ts";

assert.equal(
  isMissingGeminiError("Alice is not configured yet (missing GEMINI_API_KEY)."),
  true,
);
assert.equal(
  isMissingGeminiError("Alice is not configured yet (missing Gemini API key)."),
  true,
);
assert.equal(isMissingGeminiError("Unauthorized"), false);
assert.equal(
  shouldUseSavedGemini("", "Alice is not configured yet (missing GEMINI_API_KEY)."),
  true,
);
assert.equal(shouldUseSavedGemini("Open Send and choose Nigeria.", ""), false);
assert.equal(shouldUseSavedGemini("", "Unauthorized"), false);

const builtin = pickSavedGemini([
  {
    key: "system_api:plaid",
    is_enabled: true,
    config: { label: "Plaid", secrets: { secret: "plaid-secret-should-not-win" } },
  },
  {
    key: "system_api:909681129488",
    is_enabled: true,
    config: { label: "Google Gemini", secrets: { api_key: "custom-gemini-key" } },
  },
  {
    key: "system_api:gemini",
    is_enabled: true,
    config: { label: "Gemini", secrets: { api_key: "builtin-gemini-key" }, public_config: { model: "gemini-2.0-flash" } },
  },
]);
assert.ok(builtin);
assert.equal(builtin.apiKey, "builtin-gemini-key");
assert.equal(builtin.model, "gemini-2.0-flash");

const customOnly = pickSavedGemini([
  {
    key: "system_api:gemini",
    is_enabled: true,
    config: { label: "Gemini", secrets: {} },
  },
  {
    key: "system_api:909681129488",
    is_enabled: true,
    config: { label: "Google Gemini", secrets: { api_key: "custom-gemini-key" } },
  },
]);
assert.ok(customOnly);
assert.equal(customOnly.apiKey, "custom-gemini-key");
assert.equal(customOnly.model, "gemini-2.5-flash");

const disabled = pickSavedGemini([
  {
    key: "system_api:gemini",
    is_enabled: false,
    config: { label: "Gemini", secrets: { api_key: "disabled-key" } },
  },
]);
assert.equal(disabled, null);

const alternateField = pickSavedGemini([
  {
    key: "system_api:google_gemini",
    is_enabled: true,
    config: { label: "Google Gemini", secrets: { token: "labeled-secret" } },
  },
]);
assert.ok(alternateField);
assert.equal(alternateField.apiKey, "labeled-secret");

console.log("alice gemini key checks passed");
