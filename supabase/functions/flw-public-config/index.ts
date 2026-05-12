const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("action") === "public_key") {
      return json({ publicKey: Deno.env.get("FLW_PUBLIC_KEY") ?? "" });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("flw-public-config error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});