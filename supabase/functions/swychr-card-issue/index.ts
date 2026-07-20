import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isSwychrCardSandbox, isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import {
  createSwychrFullUser,
  extractSwychrCard,
  extractSwychrCardId,
  extractSwychrLastFour,
  extractSwychrUserId,
  findSwychrUserIdByEmail,
  issueSwychrLiteCard,
} from "../_shared/swychr-card.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function splitPhone(raw: string | null | undefined): { mobile?: string; mobile_code?: string } {
  if (!raw) return {};
  const digits = raw.replace(/[^\d+]/g, "");
  const m = digits.match(/^\+(\d{1,3})(\d{6,14})$/);
  if (m) return { mobile_code: `+${m[1]}`, mobile: m[2] };
  const only = digits.replace(/\D/g, "");
  if (only.length >= 8) return { mobile: only.slice(-10), mobile_code: "+1" };
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isSwychrEnabled() || !isSwychrConfigured("card")) {
    return new Response(JSON.stringify({ error: "Swychr cards disabled" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { amount, card_type, wallet_id, email, name, country, kyc } = body;
  if (!amount) {
    return new Response(JSON.stringify({ error: "amount required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: existingHolder } = await admin.from("swychr_cardholders")
    .select("id, swychr_user_id, email")
    .eq("user_id", user.id)
    .maybeSingle();

  let swychrUserId = typeof body.swychr_user_id === "string" && body.swychr_user_id.trim()
    ? body.swychr_user_id.trim()
    : existingHolder?.swychr_user_id ?? null;
  let cardholderId = existingHolder?.id ?? null;

  if (!swychrUserId) {
    const { data: profile } = await admin.from("profiles")
      .select("full_name, email, phone_number, country_code, street_address, city, postal_code, address_country")
      .eq("user_id", user.id)
      .maybeSingle();

    const holderEmail = String(email ?? profile?.email ?? user.email ?? "").trim();
    const holderName = String(name ?? profile?.full_name ?? holderEmail.split("@")[0] ?? "Cardholder").trim();
    if (!holderEmail) {
      return new Response(JSON.stringify({ error: "Profile email required to create Swychr cardholder" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = splitPhone(profile?.phone_number);
    const countryName = String(country ?? profile?.address_country ?? "Nigeria");
    const iso = String(profile?.country_code ?? "NG").toUpperCase().slice(0, 2);

    const kycExtra = (kyc && typeof kyc === "object" ? kyc as Record<string, unknown> : {});
    // Live prod: create_user returns user_id:null; create_full_user returns data.id and Approves KYC.
    const createResult = await createSwychrFullUser({
      email: holderEmail,
      name: holderName,
      country: countryName,
      country_iso_code: iso,
      address: profile?.street_address ?? undefined,
      city: profile?.city ?? undefined,
      postal_code: profile?.postal_code ?? undefined,
      dob: typeof kycExtra.dob === "string" ? kycExtra.dob : "1990-01-01",
      gender: typeof kycExtra.gender === "string" ? kycExtra.gender : "Other",
      ...phone,
      id_proof_type: "PASSPORT",
      id_proof_no: `EFIN-${user.id.slice(0, 8).toUpperCase()}`,
      id_proof_expiry_date: "2030-12-31",
      ...kycExtra,
    });

    if (!createResult.ok) {
      // Email may already exist — resolve via /users list
      const existingId = await findSwychrUserIdByEmail(holderEmail);
      if (!existingId) {
        return new Response(JSON.stringify({
          error: createResult.message || "Could not create Swychr cardholder",
          raw: createResult.data,
          environment: isSwychrCardSandbox() ? "sandbox" : "prod",
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      swychrUserId = existingId;
    } else {
      swychrUserId = extractSwychrUserId(createResult.data as Record<string, unknown>);
      if (!swychrUserId) {
        swychrUserId = await findSwychrUserIdByEmail(holderEmail);
      }
    }

    if (!swychrUserId) {
      return new Response(JSON.stringify({
        error: "Swychr did not return a cardholder id (create_user returns null on prod — use create_full_user)",
        raw: createResult.data,
        environment: isSwychrCardSandbox() ? "sandbox" : "prod",
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: upserted, error: upsertErr } = await admin.from("swychr_cardholders").upsert({
      user_id: user.id,
      swychr_user_id: swychrUserId,
      email: holderEmail,
      raw_profile: createResult.data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).select("id").single();

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    cardholderId = upserted.id;
  } else if (!cardholderId) {
    const { data: upserted } = await admin.from("swychr_cardholders").upsert({
      user_id: user.id,
      swychr_user_id: swychrUserId,
      email: typeof email === "string" ? email : user.email ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).select("id").single();
    cardholderId = upserted?.id ?? null;
  }

  const result = await issueSwychrLiteCard({
    user_id: swychrUserId,
    amount: Number(amount),
    card_type: (card_type === "VISA" ? "VISA" : "MASTERCARD"),
  });

  if (!result.ok) {
    const msg = result.message || "Card issue failed";
    const hint = /insufficient wallet/i.test(msg)
      ? "Fund the Swychr admin Box wallet in the AccountPe dashboard (card issuance fee + load)."
      : undefined;
    return new Response(JSON.stringify({
      error: msg,
      hint,
      raw: result.data,
      environment: isSwychrCardSandbox() ? "sandbox" : "prod",
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const card = extractSwychrCard(result.data as Record<string, unknown>);
  const swychrCardId = extractSwychrCardId(card)
    ?? (typeof (result.data as Record<string, unknown>).card_id === "string"
      ? String((result.data as Record<string, unknown>).card_id)
      : null);
  if (!swychrCardId || swychrCardId === "0") {
    return new Response(JSON.stringify({
      error: result.message || "Card issue returned no card_id",
      raw: result.data,
      environment: isSwychrCardSandbox() ? "sandbox" : "prod",
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const lastFour = extractSwychrLastFour(card);

  await admin.from("swychr_cards").insert({
    user_id: user.id,
    cardholder_id: cardholderId,
    swychr_card_id: swychrCardId,
    card_type: String(card_type ?? "MASTERCARD"),
    last_four: lastFour,
    status: "active",
    wallet_id: typeof wallet_id === "string" ? wallet_id : null,
    raw_response: result.data,
  });

  return new Response(JSON.stringify({
    success: true,
    card,
    swychr_user_id: swychrUserId,
    environment: isSwychrCardSandbox() ? "sandbox" : "prod",
    message: result.message,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
