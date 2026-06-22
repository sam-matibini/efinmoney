import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Read the JSON error body from a failed edge function invocation. */
export async function edgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) {
        const hint = body.hint ? ` (${body.hint})` : "";
        const detail = body.detail?.message || body.detail?.errorCode || "";
        return detail ? `${body.error}: ${detail}${hint}` : `${body.error}${hint}`;
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}

export async function invokeEdgeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);
  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error));
  }
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}
