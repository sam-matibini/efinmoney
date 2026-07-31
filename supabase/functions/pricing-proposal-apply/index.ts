// Phase 11 — approve / reject a pricing proposal.
// Approving inserts a new versioned efinmoney_pricing row and records an audit
// entry; rejecting stores the reviewer note only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { applyProposal, loadSettings } from "../_shared/pricingProposals.ts";

const BodySchema = z.object({
  proposal_id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(1000).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ success: false, error: "Unauthorized" }, 401);

    const { data: isManager } = await supabase.rpc("is_pricing_manager", { _uid: user.id });
    if (!isManager) return json({ success: false, error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
    const { proposal_id, action, note } = parsed.data;

    const { data: proposal, error: pErr } = await supabase
      .from("pricing_proposals")
      .select("*")
      .eq("id", proposal_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!proposal) return json({ success: false, error: "Proposal not found" }, 404);
    if (proposal.status !== "pending") {
      return json({ success: false, error: `Proposal is already ${proposal.status}` }, 400);
    }

    const nowIso = new Date().toISOString();

    if (action === "reject") {
      const { error } = await supabase
        .from("pricing_proposals")
        .update({
          status: "rejected",
          review_note: note ?? null,
          reviewed_by: user.id,
          reviewed_at: nowIso,
        })
        .eq("id", proposal_id);
      if (error) throw new Error(error.message);
      return json({ success: true, status: "rejected" });
    }

    const settings = await loadSettings(supabase);
    const res = await applyProposal(
      supabase,
      { ...proposal, reviewed_by: user.id, reviewed_at: nowIso, review_note: note ?? null },
      settings,
      user.id,
    );
    if (!res.ok) return json({ success: false, error: res.error }, 400);

    if (note) {
      await supabase.from("pricing_proposals").update({ review_note: note }).eq("id", proposal_id);
    }

    return json({ success: true, status: "applied", pricing_id: res.pricing_id });
  } catch (e) {
    console.error("pricing-proposal-apply failed", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
