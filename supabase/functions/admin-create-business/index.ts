import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UboInput {
  full_name: string;
  dob?: string | null;
  nationality?: string | null;
  ownership_pct: number;
  voting_pct: number;
  control_pct: number;
  address?: string | null;
  id_document_type?: string | null;
  id_document_number?: string | null;
  pep_status?: "none" | "domestic_pep" | "foreign_pep" | "hio" | "family_member" | "close_associate";
}

interface Payload {
  // Owner (the person who will log in to manage the business)
  ownerEmail: string;
  ownerFullName: string;
  ownerPhone?: string;
  ownerCountryCode?: string;

  // Business details
  businessName: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  taxId?: string;
  registrationNumber?: string;
  dateOfIncorporation?: string;
  industry?: string;
  website?: string;
  companyType?: string;
  riskLevel?: "low" | "medium" | "high";

  // UBOs — ownership_pct and voting_pct across all UBOs must each total 100
  ubos: UboInput[];

  // Calling admin's id (auth.uid of the super_admin using the Developer tab)
  onboardedByAdminId: string;
}

const TOTAL_TOLERANCE = 0.01;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Authenticate caller ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Verify caller is super_admin (mirrors hasPermission("developer_onboarding")) ---
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: callerAdmin } = await admin
      .from("admin_users")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!callerAdmin || callerAdmin.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "developer_onboarding permission required (super_admin role)" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Parse and validate payload ---
    const body: Payload = await req.json();
    if (!body.ownerEmail || !body.businessName || !body.onboardedByAdminId) {
      return new Response(
        JSON.stringify({ error: "ownerEmail, businessName, and onboardedByAdminId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!Array.isArray(body.ubos) || body.ubos.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one UBO is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    for (const u of body.ubos) {
      if (!u.full_name) {
        return new Response(
          JSON.stringify({ error: "Every UBO must have a full_name" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate UBO totals (primary defense; DB trigger is the safety net)
    const totalOwnership = body.ubos.reduce((s, u) => s + Number(u.ownership_pct || 0), 0);
    const totalVoting = body.ubos.reduce((s, u) => s + Number(u.voting_pct || 0), 0);
    if (Math.abs(totalOwnership - 100) > TOTAL_TOLERANCE) {
      return new Response(
        JSON.stringify({
          error: `UBO ownership_pct must total 100 (got ${totalOwnership.toFixed(2)})`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (Math.abs(totalVoting - 100) > TOTAL_TOLERANCE) {
      return new Response(
        JSON.stringify({
          error: `UBO voting_pct must total 100 (got ${totalVoting.toFixed(2)})`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Create owner auth user ---
    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: body.ownerEmail,
        password: tempPassword,
        email_confirm: false,
        user_metadata: {
          full_name: body.ownerFullName,
          onboarded_by_admin: "true",
        },
      });
    if (createErr || !created.user) {
      return new Response(
        JSON.stringify({ error: createErr?.message || "Owner create failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const ownerUserId = created.user.id;

    // handle_new_user trigger has already created profile + wallets + risk_tier + kyc_verifications.
    // Update the profile to tier_0 / pending and stamp the onboarded_by fields.
    const now = new Date().toISOString();
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        full_name: body.ownerFullName,
        phone_number: body.ownerPhone ?? null,
        country_code: body.ownerCountryCode ?? null,
        kyc_status: "pending",
        kyc_tier: "tier_0",
        onboarded_by_admin_id: body.onboardedByAdminId,
        onboarded_via: "admin",
        onboarded_at: now,
      })
      .eq("user_id", ownerUserId);
    if (profileErr) {
      // Roll back the auth user so we don't leave a half-created account
      await admin.auth.admin.deleteUser(ownerUserId);
      return new Response(
        JSON.stringify({ error: `Profile update failed: ${profileErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Create customer (business) record ---
    const { data: customer, error: customerErr } = await admin
      .from("customers")
      .insert({
        name: body.businessName,
        email: body.businessEmail ?? body.ownerEmail,
        phone: body.businessPhone ?? null,
        address: body.businessAddress ?? null,
        tax_id: body.taxId ?? null,
        registration_number: body.registrationNumber ?? null,
        date_of_incorporation: body.dateOfIncorporation ?? null,
        industry: body.industry ?? null,
        website: body.website ?? null,
        company_type: body.companyType ?? null,
        risk_level: body.riskLevel ?? "medium",
        kyc_status: "pending",
        kyc_verified_by: null,  // the user will verify themselves
        onboarding_started_at: now,
        onboarded_by_admin_id: body.onboardedByAdminId,
        onboarded_via: "admin",
        onboarded_at: now,
      })
      .select("id")
      .single();
    if (customerErr || !customer) {
      await admin.auth.admin.deleteUser(ownerUserId);
      return new Response(
        JSON.stringify({ error: `Customer create failed: ${customerErr?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const customerId = customer.id;

    // --- Link owner auth user to customer via customer_portal_access ---
    const { error: portalErr } = await admin
      .from("customer_portal_access")
      .insert({
        customer_id: customerId,
        user_id: ownerUserId,
        is_active: true,
      });
    if (portalErr) {
      // Roll back auth user and customer. We can't easily roll back the customer
      // here without a service-role DELETE; the DB trigger on customer_portal_access
      // is ON DELETE CASCADE, so deleting the customer would cascade anyway.
      // Best-effort cleanup:
      await admin.from("customer_portal_access").delete().eq("customer_id", customerId);
      await admin.from("customers").delete().eq("id", customerId);
      await admin.auth.admin.deleteUser(ownerUserId);
      return new Response(
        JSON.stringify({ error: `Portal access create failed: ${portalErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Insert UBOs ---
    // The trigger trg_check_ubo_ownership_total validates the total; if it fails
    // we surface the error and roll back everything.
    const uboRows = body.ubos.map((u) => ({
      customer_id: customerId,
      full_name: u.full_name,
      dob: u.dob ?? null,
      nationality: u.nationality ?? null,
      ownership_pct: Number(u.ownership_pct),
      voting_pct: Number(u.voting_pct),
      control_pct: Number(u.control_pct || 0),
      pep_status: u.pep_status ?? "none",
      sanctions_status: "not_screened",
      address: u.address ?? null,
      id_document_type: u.id_document_type ?? null,
      id_document_number: u.id_document_number ?? null,
    }));
    const { data: ubos, error: uboErr } = await admin
      .from("beneficial_owners")
      .insert(uboRows)
      .select("id");
    if (uboErr || !ubos) {
      await admin.from("customer_portal_access").delete().eq("customer_id", customerId);
      await admin.from("customers").delete().eq("id", customerId);
      await admin.auth.admin.deleteUser(ownerUserId);
      return new Response(
        JSON.stringify({ error: `UBO insert failed: ${uboErr?.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Send recovery email to the owner ---
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: body.ownerEmail,
    });
    if (linkErr) {
      // Roll back everything we created
      await admin.from("customer_portal_access").delete().eq("customer_id", customerId);
      await admin.from("customers").delete().eq("id", customerId);
      await admin.auth.admin.deleteUser(ownerUserId);
      return new Response(
        JSON.stringify({ error: `Failed to generate recovery link: ${linkErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const actionLink = (linkData?.properties as { action_link?: string } | undefined)?.action_link;
    if (!actionLink) {
      await admin.from("customer_portal_access").delete().eq("customer_id", customerId);
      await admin.from("customers").delete().eq("id", customerId);
      await admin.auth.admin.deleteUser(ownerUserId);
      return new Response(
        JSON.stringify({ error: "Recovery link missing action_link property" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send the admin_invitation email
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        type: "admin_invitation",
        to: body.ownerEmail,
        data: {
          name: body.ownerFullName,
          action_link: actionLink,
          expires_in_minutes: 60,
        },
      }),
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: ownerUserId,
        customer_id: customerId,
        ubo_ids: ubos.map((u) => u.id),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
