import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Fields an admin may edit on a user profile. */
const EDITABLE = [
  "full_name",
  "email",
  "phone_number",
  "date_of_birth",
  "occupation",
  "street_address",
  "city",
  "state_province",
  "postal_code",
  "address_country",
  "default_currency",
  "efin_tag",
] as const;

type Editable = (typeof EDITABLE)[number];

const ADMIN_ROLES_WITH_EDIT = ["super_admin", "compliance_officer"];

function validate(patch: Record<string, unknown>): string | null {
  const s = (k: Editable) => (typeof patch[k] === "string" ? (patch[k] as string).trim() : null);

  if ("full_name" in patch) {
    const v = s("full_name");
    if (!v || v.length < 2 || v.length > 120) return "Full name must be 2–120 characters.";
  }
  if ("email" in patch) {
    const v = s("email");
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 255) return "Enter a valid email address.";
  }
  if (patch.phone_number) {
    const v = String(patch.phone_number).replace(/[\s\-()]/g, "");
    if (!/^\+[1-9]\d{6,15}$/.test(v)) return "Phone must be in international format, e.g. +14165550123.";
    patch.phone_number = v;
  }
  if (patch.date_of_birth) {
    const v = String(patch.date_of_birth);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Date of birth must be a valid date.";
    const dob = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) return "Date of birth must be a valid date.";
    const now = new Date();
    if (dob > now) return "Date of birth cannot be in the future.";
    const age = (now.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 18) return "User must be at least 18 years old.";
    if (age > 120) return "Date of birth is out of range.";
  }
  if (patch.occupation && String(patch.occupation).length > 120) return "Occupation must be under 120 characters.";
  if (patch.address_country) {
    const v = String(patch.address_country).toUpperCase();
    if (!/^[A-Z]{2}$/.test(v)) return "Country must be a 2-letter ISO code.";
    patch.address_country = v;
  }
  if (patch.default_currency) {
    const v = String(patch.default_currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(v)) return "Currency must be a 3-letter ISO code.";
    patch.default_currency = v;
  }
  if (patch.efin_tag) {
    const v = String(patch.efin_tag).replace(/^@/, "");
    if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(v)) {
      return "@tag must be 3–20 chars, start with a letter, letters/numbers/_ only.";
    }
    patch.efin_tag = v;
  }
  for (const k of ["street_address", "city", "state_province", "postal_code"] as const) {
    if (patch[k] && String(patch[k]).length > 200) return `${k.replace(/_/g, " ")} is too long.`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Caller must be an active admin_users record with an edit_users-capable role,
    // or hold the platform 'admin' role.
    const { data: adminRec } = await admin
      .from("admin_users")
      .select("id, role, status, full_name, email")
      .eq("id", userData.user.id)
      .maybeSingle();
    const { data: platformAdmin } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    const canEdit =
      (adminRec && adminRec.status === "active" && ADMIN_ROLES_WITH_EDIT.includes(adminRec.role)) ||
      !!platformAdmin;
    if (!canEdit) return json({ error: "Insufficient permissions to edit users" }, 403);

    const body = await req.json().catch(() => null);
    const targetUserId: string | undefined = body?.user_id;
    const rawUpdates = body?.updates;
    if (!targetUserId || typeof targetUserId !== "string") return json({ error: "user_id is required" }, 400);
    if (!rawUpdates || typeof rawUpdates !== "object") return json({ error: "updates is required" }, 400);

    // Whitelist + normalise empty strings to null
    const patch: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (!(key in rawUpdates)) continue;
      const raw = (rawUpdates as Record<string, unknown>)[key];
      const value = typeof raw === "string" ? raw.trim() : raw;
      patch[key] = value === "" || value === undefined ? null : value;
    }
    if (Object.keys(patch).length === 0) return json({ error: "No editable fields supplied" }, 400);

    const invalid = validate(patch);
    if (invalid) return json({ error: invalid }, 400);

    const { data: before, error: beforeErr } = await admin
      .from("profiles")
      .select(EDITABLE.join(", "))
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (beforeErr) return json({ error: beforeErr.message }, 400);
    if (!before) return json({ error: "User not found" }, 404);

    // Only persist fields that actually changed
    const changed: Record<string, unknown> = {};
    const previous: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      const old = (before as Record<string, unknown>)[k] ?? null;
      if (String(old ?? "") !== String(v ?? "")) {
        changed[k] = v;
        previous[k] = old;
      }
    }
    if (Object.keys(changed).length === 0) {
      return json({ success: true, changed: {}, message: "No changes" });
    }

    if ("efin_tag" in changed && changed.efin_tag) {
      const { data: taken } = await admin
        .from("profiles")
        .select("user_id")
        .ilike("efin_tag", String(changed.efin_tag))
        .neq("user_id", targetUserId)
        .maybeSingle();
      if (taken) return json({ error: `@${changed.efin_tag} is already taken` }, 409);
    }

    const { error: updateErr } = await admin
      .from("profiles")
      .update({ ...changed, updated_at: new Date().toISOString() })
      .eq("user_id", targetUserId);
    if (updateErr) return json({ error: updateErr.message }, 400);

    // Side effects below must never fail the save — the profile is already updated.
    try {
      // Keep the auth account email in sync when the email changes
      if ("email" in changed && changed.email) {
        const { error: authErr } = await admin.auth.admin.updateUserById(targetUserId, {
          email: String(changed.email),
          email_confirm: true,
        });
        if (authErr) console.error("auth email sync failed", authErr.message);
      }
    } catch (e) {
      console.error("auth email sync threw", e);
    }

    try {
      await admin.from("audit_logs").insert({
        user_id: userData.user.id,
        action: "admin_update_profile",
        table_name: "profiles",
        record_id: targetUserId,
        old_data: previous,
        new_data: changed,
        user_agent: req.headers.get("user-agent"),
      });
    } catch (e) {
      console.error("audit log insert failed", e);
    }

    return json({ success: true, changed });
  } catch (e) {
    console.error("admin-update-user error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
