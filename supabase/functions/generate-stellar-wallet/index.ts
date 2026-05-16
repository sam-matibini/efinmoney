import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as StellarSdk from "npm:stellar-sdk@12";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENC_KEY = Deno.env.get("STELLAR_ENCRYPTION_KEY")!;

async function getKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(ENC_KEY);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSeed(seed: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(seed))
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv);
  combined.set(ct, iv.length);
  return btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Find user's USD wallet (or default)
    const { data: wallets, error: wErr } = await admin
      .from("wallets")
      .select("id, currency_code, stellar_address, is_default")
      .eq("user_id", user.id);
    if (wErr) throw wErr;

    const target = wallets?.find((w) => w.currency_code === "USD")
      ?? wallets?.find((w) => w.is_default)
      ?? wallets?.[0];

    if (!target) {
      return new Response(JSON.stringify({ error: "No wallet found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target.stellar_address) {
      return new Response(JSON.stringify({
        stellar_address: target.stellar_address,
        already_existed: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Generate keypair
    const kp = StellarSdk.Keypair.random();
    const publicKey = kp.publicKey();
    const secret = kp.secret();
    const encrypted = await encryptSeed(secret);

    // Save to DB
    const { error: upWalletErr } = await admin
      .from("wallets")
      .update({ stellar_address: publicKey })
      .eq("id", target.id);
    if (upWalletErr) throw upWalletErr;

    const { error: upProfileErr } = await admin
      .from("profiles")
      .update({ stellar_seed_encrypted: encrypted })
      .eq("user_id", user.id);
    if (upProfileErr) throw upProfileErr;

    // Fund via Friendbot (testnet)
    let funded = false;
    let fundError: string | null = null;
    try {
      const r = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
      funded = r.ok;
      if (!r.ok) fundError = await r.text();
    } catch (e) {
      fundError = String(e);
    }

    return new Response(JSON.stringify({
      stellar_address: publicKey,
      funded,
      fund_error: fundError,
      already_existed: false,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("generate-stellar-wallet error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
