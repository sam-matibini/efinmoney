import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Turn API / Supabase / edge-function error payloads into human-readable text. */
export function stringifyErrorValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message || "Request failed";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.error === "string" && o.error) return o.error;
    if (typeof o.error === "object" && o.error) return stringifyErrorValue(o.error);
    if (typeof o.details === "string" && o.details) return o.details;
    if (typeof o.hint === "string" && o.hint) return o.hint;
    try {
      const json = JSON.stringify(value);
      return json === "{}" ? "Request failed" : json;
    } catch {
      return "Request failed";
    }
  }
  return String(value);
}

/** Read the JSON error body from a failed edge function invocation. */
export async function edgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) {
        const main = stringifyErrorValue(body.error);
        const hint = body.hint ? ` (${stringifyErrorValue(body.hint)})` : "";
        const detail = body.detail?.message || body.detail?.errorCode || "";
        const detailText = detail ? stringifyErrorValue(detail) : "";
        return detailText ? `${main}: ${detailText}${hint}` : `${main}${hint}`;
      }
      if (body?.message) return stringifyErrorValue(body.message);
    } catch {
      /* ignore parse errors */
    }
  }
  return stringifyErrorValue(error) || "Request failed";
}

export async function invokeEdgeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);
  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error));
  }
  const payload = data as { error?: unknown };
  if (payload?.error) {
    throw new Error(stringifyErrorValue(payload.error));
  }
  return data as T;
}
