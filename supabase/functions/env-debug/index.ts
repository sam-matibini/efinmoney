Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  try {
    const info: Record<string, number> = {};
    for (const name of Deno.env.names()) {
      const v = Deno.env.get(name);
      info[name] = v ? v.length : 0;
    }
    return new Response(JSON.stringify(info), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
