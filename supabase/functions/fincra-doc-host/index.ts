/**
 * One-shot: upload KYC docs to public Storage for Fincra CAD VA review.
 * POST { confirm, filename, contentType, data (base64) }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "fincra-kyc";
const CONFIRM = "efm-fincra-docs";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "POST required" }, { status: 405, headers: corsHeaders });
    }
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== CONFIRM) {
      return Response.json({ error: "forbidden" }, { status: 403, headers: corsHeaders });
    }

    const filename = String(body.filename || "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const contentType = String(body.contentType || "application/octet-stream");
    const b64 = String(body.data || "");
    if (!filename || !b64) {
      return Response.json({ error: "filename and data required" }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === BUCKET)) {
      const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 10_000_000,
      });
      if (createErr && !/already exists/i.test(createErr.message)) {
        return Response.json({ error: createErr.message }, { status: 500, headers: corsHeaders });
      }
    }

    const folder = String(body.folder || "cad-va-samson").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${folder}/${filename}`;
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, raw, {
      contentType,
      upsert: true,
    });
    if (upErr) {
      return Response.json({ error: upErr.message }, { status: 500, headers: corsHeaders });
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return Response.json({
      success: true,
      path,
      url: pub.publicUrl,
      note: "Public URL — delete from Storage after Fincra approves.",
    }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "upload failed" },
      { status: 500, headers: corsHeaders },
    );
  }
});
