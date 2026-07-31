import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface GeoInfo {
  country: string | null;
  timezone: string | null;
  currency: string | null;
}

const EMPTY: GeoInfo = { country: null, timezone: null, currency: null };

const clientIp = (req: Request): string | null => {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: GeoInfo, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    // Cloudflare-style country hint, when present.
    const cfCountry = req.headers.get('cf-ipcountry');
    const ip = clientIp(req);

    if (!ip) {
      return json({ ...EMPTY, country: cfCountry && cfCountry !== 'XX' ? cfCountry : null });
    }

    const res = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      { signal: AbortSignal.timeout(4000) },
    );

    if (!res.ok) {
      return json({ ...EMPTY, country: cfCountry && cfCountry !== 'XX' ? cfCountry : null });
    }

    const data = await res.json();
    return json({
      country: (data?.country_code as string | undefined) || cfCountry || null,
      timezone: (data?.timezone as string | undefined) || null,
      currency: (data?.currency as string | undefined) || null,
    });
  } catch (_e) {
    // Fail soft — callers fall back to browser/profile data.
    return json(EMPTY);
  }
});
