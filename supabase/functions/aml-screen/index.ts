import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NAME_THRESHOLD = 0.75;

function normalize(s: string) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { user_id, trigger = "manual", trigger_ref = null, subject_override } = body ?? {};

    if (!user_id || typeof user_id !== "string") {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["kyc", "transfer", "p2p", "manual", "rescreen"].includes(trigger)) {
      return new Response(JSON.stringify({ error: "invalid trigger" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Load subject from profile (or override)
    let subjectName = subject_override?.name as string | undefined;
    let subjectDob = subject_override?.dob as string | undefined;
    let subjectCountry = subject_override?.country as string | undefined;

    if (!subjectName) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name, date_of_birth, country, email")
        .eq("user_id", user_id)
        .maybeSingle();
      if (!prof) {
        return new Response(JSON.stringify({ error: "profile not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      subjectName = prof.full_name || [prof.first_name, prof.last_name].filter(Boolean).join(" ") || prof.email;
      subjectDob = subjectDob || prof.date_of_birth;
      subjectCountry = subjectCountry || prof.country;
    }

    const normalized = normalize(subjectName!);

    if (!normalized) {
      return new Response(JSON.stringify({ error: "subject name empty" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query watchlist via raw SQL through rpc would be cleaner; use REST with similarity filter
    // Fetch candidates using pg_trgm via filter on aliases containment + similarity in SQL view.
    // Simpler: fetch up to 200 candidates with overlapping trigrams using ILIKE on first token.
    const firstToken = normalized.split(" ")[0];

    const { data: candidates, error: candErr } = await supabase
      .from("aml_watchlist")
      .select("id, source, name, name_normalized, aliases, dob_year, dob, countries, programs")
      .or(`name_normalized.ilike.%${firstToken}%,aliases.cs.{${firstToken}}`)
      .limit(500);

    if (candErr) throw candErr;

    // Simple Jaro-ish scoring via token overlap + Dice coefficient on trigrams
    const subjectTokens = new Set(normalized.split(" "));
    const subjectTrigrams = trigrams(normalized);

    type Match = { watchlist_id: string; score: number; match_type: string };
    const matches: Match[] = [];

    for (const c of candidates ?? []) {
      const candNames = [c.name_normalized, ...(c.aliases ?? []).map((a: string) => normalize(a))];
      let best = 0;
      let bestType = "name";
      for (const cn of candNames) {
        if (!cn) continue;
        const dice = diceCoefficient(subjectTrigrams, trigrams(cn));
        const tokenOverlap = jaccard(subjectTokens, new Set(cn.split(" ")));
        const score = Math.max(dice, tokenOverlap);
        if (score > best) {
          best = score;
          bestType = cn === c.name_normalized ? "name" : "alias";
        }
      }
      // DOB tiebreak: require matching year if subject has DOB AND candidate has DOB
      if (subjectDob && c.dob_year) {
        const subjYear = new Date(subjectDob).getUTCFullYear();
        if (subjYear === c.dob_year && best >= 0.6) {
          best = Math.max(best, 0.85);
          bestType = "dob_name";
        } else if (best < NAME_THRESHOLD) {
          continue;
        }
      }
      if (best >= NAME_THRESHOLD) {
        matches.push({ watchlist_id: c.id, score: Number(best.toFixed(4)), match_type: bestType });
      }
    }

    // Insert screening
    const status = matches.length > 0 ? "hit" : "clear";
    const { data: screening, error: sErr } = await supabase
      .from("aml_screenings")
      .insert({
        user_id,
        trigger,
        trigger_ref,
        subject_name: subjectName,
        subject_dob: subjectDob || null,
        subject_country: subjectCountry || null,
        status,
        match_count: matches.length,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    if (matches.length > 0) {
      const matchRows = matches.map((m) => ({ ...m, screening_id: screening.id }));
      await supabase.from("aml_matches").insert(matchRows);

      await supabase.from("profiles").update({
        aml_status: "hit",
        aml_last_screened_at: new Date().toISOString(),
      }).eq("user_id", user_id);

      // Notify admins via notifications table (in-app)
      const { data: admins } = await supabase.from("admin_users").select("id");
      if (admins?.length) {
        const notifs = admins.map((a: any) => ({
          user_id: a.id,
          title: "AML/PEP Hit",
          message: `Screening hit for ${subjectName} (${matches.length} match${matches.length === 1 ? "" : "es"}, trigger: ${trigger})`,
          type: "aml_alert",
          is_read: false,
        }));
        await supabase.from("notifications").insert(notifs);
      }

      // Best-effort email to compliance via send-email
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({
            type: "aml_hit",
            to: "compliance@efin.money",
            data: { subject_name: subjectName, trigger, match_count: matches.length, screening_id: screening.id },
          }),
        });
      } catch (_) { /* non-fatal */ }
    } else {
      await supabase.from("profiles").update({
        aml_status: "clear",
        aml_last_screened_at: new Date().toISOString(),
      }).eq("user_id", user_id);
    }

    return new Response(JSON.stringify({ screening_id: screening.id, status, match_count: matches.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aml-screen error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}
function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
