import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  elicateCreatePaymentLink,
  elicateGetPaymentLink,
  elicateListPaymentLinks,
  elicateUpdatePaymentLink,
  getElicateConfig,
} from "../_shared/elicate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "list");
    const cfg = getElicateConfig();
    if (!cfg.secretKey) return json({ error: "Elicate secret not configured" }, 500);

    if (action === "list") {
      const { data: local } = await admin.from("elicate_payment_links")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      // Refresh remote list opportunistically (ignore failures)
      await elicateListPaymentLinks().catch(() => null);

      return json({
        links: (local ?? []).map((row) => ({
          id: row.id,
          slug: row.slug,
          url: row.url,
          name: row.name,
          type: row.link_type,
          amount: row.amount != null ? Number(row.amount) : null,
          min_amount: row.min_amount != null ? Number(row.min_amount) : null,
          active: row.active,
          wallet_id: row.wallet_id,
          created_at: row.created_at,
        })),
        mode: cfg.mode,
      });
    }

    if (action === "create") {
      const name = String(body.name || "").trim();
      const type = body.type === "flexible" ? "flexible" : "fixed";
      const walletId = typeof body.wallet_id === "string" ? body.wallet_id : null;
      if (!name) return json({ error: "name required" }, 400);
      if (!walletId) return json({ error: "wallet_id required" }, 400);

      const { data: wallet } = await userClient.from("wallets")
        .select("id,currency_code,user_id")
        .eq("id", walletId)
        .maybeSingle();
      if (!wallet || wallet.user_id !== user.id) return json({ error: "Invalid wallet" }, 403);
      if (wallet.currency_code !== "ZMW") return json({ error: "Payment links require a ZMW wallet" }, 400);

      const payload: Record<string, unknown> = {
        name,
        type,
        description: typeof body.description === "string" ? body.description : undefined,
        redirect_url: typeof body.redirect_url === "string"
          ? body.redirect_url
          : `${Deno.env.get("APP_URL") || "https://app.efinmoney.com"}/receive`,
      };
      if (type === "fixed") {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount < 1) return json({ error: "amount required for fixed links" }, 400);
        payload.amount = amount;
      } else {
        payload.min_amount = Number(body.min_amount ?? 0);
      }

      const result = await elicateCreatePaymentLink(payload);
      if (!result.ok) return json({ error: result.error || "Create link failed", raw: result.data }, 502);

      const remote = result.data as Record<string, unknown>;
      const { data: row, error: insErr } = await admin.from("elicate_payment_links").insert({
        user_id: user.id,
        wallet_id: walletId,
        elicate_link_id: String(remote.id ?? ""),
        slug: remote.slug != null ? String(remote.slug) : null,
        url: remote.url != null ? String(remote.url) : null,
        name,
        link_type: type,
        amount: type === "fixed" ? Number(body.amount) : null,
        min_amount: type === "flexible" ? Number(body.min_amount ?? 0) : 0,
        description: typeof body.description === "string" ? body.description : null,
        redirect_url: typeof payload.redirect_url === "string" ? payload.redirect_url : null,
        active: remote.active !== false,
        raw_response: remote,
      }).select().single();

      if (insErr) return json({ error: insErr.message }, 500);

      return json({
        link: {
          id: row.id,
          slug: row.slug,
          url: row.url,
          name: row.name,
          type: row.link_type,
          amount: row.amount != null ? Number(row.amount) : null,
          min_amount: row.min_amount != null ? Number(row.min_amount) : null,
          active: row.active,
          wallet_id: row.wallet_id,
          created_at: row.created_at,
        },
        mode: cfg.mode,
      });
    }

    if (action === "get") {
      const id = typeof body.id === "string" ? body.id : null;
      if (!id) return json({ error: "id required" }, 400);
      const { data: row } = await admin.from("elicate_payment_links")
        .select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!row) return json({ error: "Not found" }, 404);
      if (row.elicate_link_id) {
        const remote = await elicateGetPaymentLink(row.elicate_link_id);
        if (remote.ok) {
          await admin.from("elicate_payment_links").update({
            raw_response: remote.data,
            active: (remote.data as Record<string, unknown>).active !== false,
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
        }
      }
      return json({ link: row, mode: cfg.mode });
    }

    if (action === "update") {
      const id = typeof body.id === "string" ? body.id : null;
      if (!id) return json({ error: "id required" }, 400);
      const { data: row } = await admin.from("elicate_payment_links")
        .select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!row) return json({ error: "Not found" }, 404);

      const patch: Record<string, unknown> = {};
      if (typeof body.active === "boolean") patch.active = body.active;
      if (typeof body.name === "string") patch.name = body.name;

      if (row.elicate_link_id && Object.keys(patch).length) {
        const remote = await elicateUpdatePaymentLink(row.elicate_link_id, patch);
        if (!remote.ok) return json({ error: remote.error || "Update failed", raw: remote.data }, 502);
        patch.raw_response = remote.data;
      }

      const { data: updated, error: upErr } = await admin.from("elicate_payment_links")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (upErr) return json({ error: upErr.message }, 500);

      return json({
        link: {
          id: updated.id,
          slug: updated.slug,
          url: updated.url,
          name: updated.name,
          type: updated.link_type,
          amount: updated.amount != null ? Number(updated.amount) : null,
          min_amount: updated.min_amount != null ? Number(updated.min_amount) : null,
          active: updated.active,
          wallet_id: updated.wallet_id,
          created_at: updated.created_at,
        },
        mode: cfg.mode,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
