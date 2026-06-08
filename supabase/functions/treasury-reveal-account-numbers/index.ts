import { corsHeaders, json, requireUser, admin, isStaff, stripe } from "../_shared/treasury.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const db = admin();

    const { fa_id } = await req.json().catch(() => ({}));
    if (!fa_id) return json({ error: "fa_id required" }, 400);

    const { data: fa } = await db
      .from("treasury_financial_accounts")
      .select("*")
      .eq("id", fa_id)
      .maybeSingle();
    if (!fa) return json({ error: "Not found" }, 404);

    const staff = await isStaff(db, user.id);
    if (fa.user_id !== user.id && !staff) return json({ error: "Forbidden" }, 403);

    // Rate limit per user
    const { data: ok } = await db.rpc("check_rate_limit", {
      p_key: `treasury_reveal:${user.id}`,
      p_max_requests: 5,
      p_window_seconds: 300,
    });
    if (ok === false) return json({ error: "Too many requests" }, 429);

    const full = await stripe.treasury.financialAccountFeatures
      ? await stripe.treasury.financialAccounts.retrieve(
          fa.stripe_fa_id,
          { expand: ["financial_addresses.aba.account_number"] } as any,
          fa.connected_account_id ? { stripeAccount: fa.connected_account_id } : undefined,
        )
      : null;

    const aba = (full?.financial_addresses ?? []).find((f: any) => f.type === "aba")?.aba;

    // Audit log
    await db.from("audit_logs").insert({
      user_id: user.id,
      action: "treasury_reveal_account",
      resource_type: "treasury_financial_account",
      resource_id: fa.id,
      metadata: { stripe_fa_id: fa.stripe_fa_id },
    }).catch(() => {});

    return json({
      routing_number: aba?.routing_number ?? null,
      account_number: aba?.account_number ?? null,
      bank_name: aba?.bank_name ?? null,
    });
  } catch (e: any) {
    console.error("treasury-reveal", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
