import { plaidErrorMessage, plaidFetch } from "./plaid.ts";

function splitName(full: string): { given: string; family: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { given: "Customer", family: "User" };
  if (parts.length === 1) return { given: parts[0], family: "User" };
  return { given: parts[0], family: parts.slice(1).join(" ") };
}

/**
 * Create or refresh a Plaid Monitor individual screening for a user.
 * Uses /watchlist_screening/individual/create. Requires PLAID_MONITOR_PROGRAM_ID when
 * the dashboard program is not the default.
 */
export async function upsertPlaidMonitorIndividual(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: {
    userId: string;
    idvPayload?: Record<string, unknown> | null;
    givenName?: string;
    familyName?: string;
    dateOfBirth?: string;
  },
): Promise<{ ok: true; screening_id: string; status: string } | { ok: false; skipped?: boolean; error: string }> {
  const programId = (Deno.env.get("PLAID_MONITOR_PROGRAM_ID") || "").trim();

  let given = opts.givenName || "";
  let family = opts.familyName || "";
  let dob = opts.dateOfBirth || "";

  const idvUser = (opts.idvPayload?.user || {}) as Record<string, unknown>;
  const idvName = (idvUser.name || {}) as Record<string, unknown>;
  if (!given) given = String(idvName.given_name || "");
  if (!family) family = String(idvName.family_name || "");
  if (!dob) dob = String(idvUser.date_of_birth || "");

  if (!given || !family) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, date_of_birth")
      .eq("user_id", opts.userId)
      .maybeSingle();
    const split = splitName(String(profile?.full_name || ""));
    if (!given) given = split.given;
    if (!family) family = split.family;
    if (!dob) dob = String(profile?.date_of_birth || "");
  }

  const { data: existing } = await admin
    .from("plaid_monitor_entities")
    .select("screening_id, status")
    .eq("user_id", opts.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.screening_id && existing.status === "cleared") {
    return { ok: true, screening_id: existing.screening_id, status: existing.status };
  }

  const search_terms: Record<string, unknown> = {
    given_name: given,
    family_name: family,
  };
  if (dob) search_terms.date_of_birth = dob;

  const body: Record<string, unknown> = {
    client_user_id: opts.userId,
    search_terms,
  };
  if (programId) body.watchlist_program_id = programId;

  const createRes = await plaidFetch("/watchlist_screening/individual/create", body);
  if (!createRes.ok) {
    // Program missing is a soft skip so IDV still succeeds.
    const msg = plaidErrorMessage(createRes.json);
    console.warn("plaid monitor create failed", msg);
    return { ok: false, skipped: true, error: msg };
  }

  const screeningId = String(createRes.json.id || "");
  const status = String(createRes.json.status || "pending_review");
  if (!screeningId) return { ok: false, error: "Monitor create returned no id" };

  await admin.from("plaid_monitor_entities").upsert(
    {
      user_id: opts.userId,
      screening_id: screeningId,
      client_user_id: opts.userId,
      given_name: given,
      family_name: family,
      status,
      program_id: programId || null,
      raw_payload: createRes.json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "screening_id", ignoreDuplicates: false },
  );

  if (status === "pending_review" || status === "rejected") {
    await admin.from("plaid_monitor_hits").insert({
      screening_id: screeningId,
      user_id: opts.userId,
      webhook_code: "INITIAL_CREATE",
      status,
      raw_payload: createRes.json,
    });
  }

  return { ok: true, screening_id: screeningId, status };
}
