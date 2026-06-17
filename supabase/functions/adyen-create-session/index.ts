import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const ADYEN_ENV = (Deno.env.get('ADYEN_ENV') || 'test').toLowerCase()
const ADYEN_API_KEY = Deno.env.get('ADYEN_API_KEY')!
const ADYEN_MERCHANT_ACCOUNT = Deno.env.get('ADYEN_MERCHANT_ACCOUNT')!
const ADYEN_CLIENT_KEY = Deno.env.get('ADYEN_CLIENT_KEY')!

const ADYEN_BASE = ADYEN_ENV === 'live'
  ? 'https://checkout-live.adyen.com/v71'
  : 'https://checkout-test.adyen.com/v71'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token)
    if (authErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const userId = claims.claims.sub as string

    const body = await req.json().catch(() => ({}))
    const {
      amount, // major units, e.g. 25.50
      currency,
      purpose = 'wallet_topup',
      target_wallet_id = null,
      target_currency = null,
      return_url,
      related_transfer_id = null,
      related_invoice_id = null,
    } = body

    if (!amount || amount <= 0) return json({ error: 'Invalid amount' }, 400)
    if (!currency || typeof currency !== 'string' || currency.length !== 3) {
      return json({ error: 'Invalid currency' }, 400)
    }
    if (!['wallet_topup','transfer_funding','invoice','admin_link'].includes(purpose)) {
      return json({ error: 'Invalid purpose' }, 400)
    }

    // Rate limit
    const { data: rl } = await supabase.rpc('check_rate_limit', {
      p_key: `adyen_session:${userId}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    })
    if (rl === false) return json({ error: 'Too many requests' }, 429)

    // Validate wallet ownership if provided
    if (target_wallet_id) {
      const { data: w } = await supabase.from('wallets').select('user_id,currency_code')
        .eq('id', target_wallet_id).maybeSingle()
      if (!w || w.user_id !== userId) return json({ error: 'Invalid wallet' }, 403)
    }

    const cur = currency.toUpperCase()
    const amountMinor = Math.round(Number(amount) * 100)
    const reference = `efin_${purpose}_${userId.slice(0,8)}_${Date.now()}`

    // Create session in DB first (pending)
    const { data: session, error: insErr } = await supabase
      .from('adyen_payment_sessions')
      .insert({
        user_id: userId,
        purpose,
        reference,
        amount_minor: amountMinor,
        currency: cur,
        target_wallet_id,
        target_currency: target_currency || cur,
        return_url,
        related_transfer_id,
        related_invoice_id,
      })
      .select()
      .single()
    if (insErr) return json({ error: insErr.message }, 500)

    // Call Adyen /sessions
    const adyenRes = await fetch(`${ADYEN_BASE}/sessions`, {
      method: 'POST',
      headers: {
        'x-API-key': ADYEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchantAccount: ADYEN_MERCHANT_ACCOUNT,
        amount: { value: amountMinor, currency: cur },
        reference,
        returnUrl: return_url || 'https://efin.money/wallets',
        countryCode: 'CA',
        shopperReference: userId,
        channel: 'Web',
        allowedPaymentMethods: ['scheme','alipay','interac_card','amex','visa','mc'],
      }),
    })

    const adyenData = await adyenRes.json()
    if (!adyenRes.ok) {
      await supabase.from('adyen_payment_sessions')
        .update({ status: 'error', last_event: adyenData })
        .eq('id', session.id)
      return json({ error: 'Adyen session failed', detail: adyenData }, 502)
    }

    await supabase.from('adyen_payment_sessions')
      .update({ raw_session: adyenData })
      .eq('id', session.id)

    return json({
      sessionId: adyenData.id,
      sessionData: adyenData.sessionData,
      clientKey: ADYEN_CLIENT_KEY,
      environment: ADYEN_ENV,
      reference,
      amount: { value: amountMinor, currency: cur },
      session_db_id: session.id,
    })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
