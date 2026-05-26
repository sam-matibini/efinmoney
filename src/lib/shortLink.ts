import { supabase } from "@/integrations/supabase/client";

const BRAND_HOST = "https://efin.money";

/**
 * Returns the public host for short links. Uses efin.money when running on
 * production custom domain; falls back to current origin so previews still work.
 */
function publicHost(): string {
  if (typeof window === "undefined") return BRAND_HOST;
  const host = window.location.host;
  if (host === "efin.money" || host === "www.efin.money") return BRAND_HOST;
  // Anywhere else (preview, sandbox, lovable.app), keep the current origin so
  // testers can click their own links.
  return window.location.origin;
}

/**
 * Create a branded short link for an in-app path + params.
 * Falls back to the long URL if creation fails so sharing never silently breaks.
 */
export async function shortenUrl(
  path: string,
  params: Record<string, string | number | undefined | null> = {},
  opts: { expiresAt?: Date; maxUses?: number } = {},
): Promise<string> {
  const cleanParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    cleanParams[k] = String(v);
  }

  const longUrl = buildLongUrl(path, cleanParams);

  try {
    const { data, error } = await supabase.rpc("create_short_link", {
      p_target_path: path,
      p_params: cleanParams,
      p_expires_at: opts.expiresAt ? opts.expiresAt.toISOString() : null,
      p_max_uses: opts.maxUses ?? null,
    });
    if (error || !data) return longUrl;
    return `${publicHost()}/s/${data}`;
  } catch {
    return longUrl;
  }
}

function buildLongUrl(path: string, params: Record<string, string>): string {
  const host = publicHost();
  const qs = new URLSearchParams(params).toString();
  return qs ? `${host}${path}?${qs}` : `${host}${path}`;
}
