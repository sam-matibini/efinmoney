/**
 * Build branded auth confirmation URLs that land on the app's /auth/confirm
 * page (verifyOtp with token_hash) instead of Supabase's stock
 * /auth/v1/verify page.
 */

export function getPublicAppOrigin(): string {
  return (
    Deno.env.get("PUBLIC_APP_URL") ||
    Deno.env.get("APP_URL") ||
    "https://www.efin.money"
  ).replace(/\/$/, "");
}

/** Prefer hashed_token from admin.generateLink(); fall back to parsing action_link. */
export function extractHashedToken(properties: {
  hashed_token?: string | null;
  action_link?: string | null;
} | null | undefined): string | null {
  const direct = String(properties?.hashed_token || "").trim();
  if (direct) return direct;
  const action = String(properties?.action_link || "").trim();
  if (!action) return null;
  try {
    const u = new URL(action);
    return u.searchParams.get("token") || u.searchParams.get("token_hash");
  } catch {
    return null;
  }
}

export function buildAppAuthConfirmUrl(opts: {
  tokenHash: string;
  type: string;
  next?: string;
  appOrigin?: string;
}): string {
  const origin = (opts.appOrigin || getPublicAppOrigin()).replace(/\/$/, "");
  const next = opts.next && opts.next.startsWith("/") ? opts.next : "/";
  return (
    `${origin}/auth/confirm?token_hash=${encodeURIComponent(opts.tokenHash)}` +
    `&type=${encodeURIComponent(opts.type)}` +
    `&next=${encodeURIComponent(next)}`
  );
}

/**
 * If `action_link` is a stock Supabase verify URL, rewrite it to /auth/confirm
 * on our public app origin. Leaves already-branded links alone.
 */
export function brandAuthActionLink(
  actionLink: string,
  opts?: { appOrigin?: string; nextDefault?: string },
): string {
  const appOrigin = (opts?.appOrigin || getPublicAppOrigin()).replace(/\/$/, "");
  const nextDefault = opts?.nextDefault || "/";
  try {
    const u = new URL(actionLink);
    const isSupabaseVerify =
      u.hostname.includes("supabase.co") && u.pathname.includes("/auth/v1/verify");
    if (!isSupabaseVerify) return actionLink;

    const tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash");
    const type = u.searchParams.get("type") || "signup";
    if (!tokenHash) return actionLink;

    let next = nextDefault;
    const redirectTo = u.searchParams.get("redirect_to");
    if (redirectTo) {
      try {
        const r = new URL(redirectTo);
        if (r.pathname.includes("/auth/confirm")) {
          next = r.searchParams.get("next") || nextDefault;
        } else if (r.pathname.startsWith("/")) {
          next = `${r.pathname}${r.search || ""}` || nextDefault;
        }
      } catch {
        /* keep default */
      }
    }

    return buildAppAuthConfirmUrl({ tokenHash, type, next, appOrigin });
  } catch {
    return actionLink;
  }
}
