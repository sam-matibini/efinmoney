import { corsHeaders, json, requireUser, admin, isStaff, stripe } from "../_shared/treasury.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const db = admin();
    const staff = await isStaff(db, user.id);

    const body = await req.json().catch(() => ({}));
    const ownerKind: "platform" | "user" = body?.owner_kind === "platform" ? "platform" : "user";
    const targetUserId: string = ownerKind === "user" ? (body?.user_id ?? user.id) : user.id;

    if (ownerKind === "platform" && !staff) return json({ error: "Forbidden" }, 403);
    if (ownerKind === "user" && targetUserId !== user.id && !staff) return json({ error: "Forbidden" }, 403);

    // Resolve Stripe connected account for user FAs
    let connectedAccountId: string | null = null;
    if (ownerKind === "user") {
      const { data: ca } = await db
        .from("stripe_connected_accounts")
        .select("stripe_account_id")
        .eq("user_id", targetUserId)
        .maybeSingle();
      connectedAccountId = ca?.stripe_account_id ?? null;
      if (!connectedAccountId) {
        return json({ error: "User has no Stripe connected account. Complete Stripe Connect onboarding first." }, 400);
      }
    }

    // Reuse if already exists
    const { data: existing } = await db
      .from("treasury_financial_accounts")
      .select("*")
      .eq("owner_kind", ownerKind)
      .eq(ownerKind === "user" ? "user_id" : "owner_kind", ownerKind === "user" ? targetUserId : "platform")
      .maybeSingle();
    if (existing) return json({ financial_account: existing, alreadyExists: true });

    // Create FA on Stripe
    const fa = await stripe.treasury.financialAccounts.create(
      {
        supported_currencies: ["usd"],
        features: {
          card_issuing: { requested: true },
          deposit_insurance: { requested: true },
          financial_addresses: { aba: { requested: true } },
          inbound_transfers: { ach: { requested: true } },
          intra_stripe_flows: { requested: true },
          outbound_payments: {
            ach: { requested: true },
            us_domestic_wire: { requested: true },
          },
          outbound_transfers: {
            ach: { requested: true },
            us_domestic_wire: { requested: true },
          },
        },
      },
      connectedAccountId ? { stripeAccount: connectedAccountId } : undefined,
    );

    const aba = (fa.financial_addresses ?? []).find((f: any) => f.type === "aba")?.aba;
    const row = {
      stripe_fa_id: fa.id,
      owner_kind: ownerKind,
      user_id: ownerKind === "user" ? targetUserId : null,
      connected_account_id: connectedAccountId,
      currency: "USD",
      aba_routing: aba?.routing_number ?? null,
      account_number_last4: aba?.account_number_last4 ?? null,
      status: fa.status ?? "open",
      features: (fa.features ?? {}) as any,
      metadata: { active_features: fa.active_features ?? [] },
    };
    const { data: inserted, error } = await db
      .from("treasury_financial_accounts")
      .insert(row)
      .select("*")
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({ financial_account: inserted });
  } catch (e: any) {
    console.error("treasury-create-fa", e);
    const msg: string = e?.message ?? "Internal error";
    // Stripe Treasury is invite-only. Surface a clear, actionable message.
    if (/treasury\/financial_accounts/i.test(msg) || /onboarded to Treasury/i.test(msg)) {
      return json({
        error: "Stripe Treasury is not enabled on this account. Treasury is invite-only — apply at https://stripe.com/docs/treasury/access and wait for approval before provisioning Financial Accounts.",
        code: "treasury_not_enabled",
      }, 400);
    }
    return json({ error: msg }, 500);
  }
});
