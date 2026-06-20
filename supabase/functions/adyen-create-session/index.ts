import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const ADYEN_ENV = (Deno.env.get('ADYEN_ENV') || 'test').toLowerCase()
const ADYEN_API_KEY = (Deno.env.get('ADYEN_API_KEY') || '').trim()
const ADYEN_MERCHANT_ACCOUNT = (Deno.env.get('ADYEN_MERCHANT_ACCOUNT') || '').trim()
const ADYEN_CLIENT_KEY = (Deno.env.get('ADYEN_CLIENT_KEY') || '').trim()

const ADYEN_BASE = ADYEN_ENV === 'live'
  ? 'https://checkout-live.adyen.com/v71'
  : 'https://checkout-test.adyen.com/v71'

function missingSecrets(): string[] {
  const missing: string[] = []
  if (!Deno.env.get('SUPABASE_URL')) missing.push('SUPABASE_URL')
  if (!Deno.env.get('SUPABASE_ANON_KEY')) missing.push('SUPABASE_ANON_KEY')
  if (!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!ADYEN_API_KEY) missing.push('ADYEN_API_KEY')
  if (!ADYEN_MERCHANT_ACCOUNT) missing.push('ADYEN_MERCHANT_ACCOUNT')
  if (!ADYEN_CLIENT_KEY) missing.push('ADYEN_CLIENT_KEY')
  return missing
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const missing = missingSecrets()
    if (missing.length) {
      return json({ error: 'Adyen not configured', missing }, 503)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: userData, error: authErr } = await userClient.auth.getUser(token)
    const userId = userData?.user?.id
    if (authErr || !userId) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const {
      amount,
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
    if (!['wallet_topup', 'transfer_funding', 'invoice', 'admin_link'].includes(purpose)) {
      return json({ error: 'Invalid purpose' }, 400)
    }

    const { data: rl, error: rlErr } = await admin.rpc('check_rate_limit', {
      p_key: `adyen_session:${userId}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    })
    if (rlErr) return json({ error: 'Rate limit check failed', detail: rlErr.message }, 500)
    if (rl === false) return json({ error: 'Too many requests' }, 429)

    if (target_wallet_id) {
      const { data: w } = await userClient.from('wallets').select('user_id,currency_code')
        .eq('id', target_wallet_id).maybeSingle()
      if (!w || w.user_id !== userId) return json({ error: 'Invalid wallet' }, 403)
    }

    const cur = currency.toUpperCase()
    const amountMinor = Math.round(Number(amount) * 100)
    const reference = `efin_${purpose}_${userId.slice(0, 8)}_${Date.now()}`

    const { data: session, error: insErr } = await admin
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

    if (insErr) {
      console.error('adyen_payment_sessions insert failed', insErr)
      const hint = insErr.message.includes('adyen_payment_sessions')
        ? 'Run migration 20260615063015 (Adyen tables) on this Supabase project.'
        : undefined
      return json({ error: insErr.message, hint }, 500)
    }

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
        allowedPaymentMethods: ['scheme', 'alipay', 'interac_card'],
      }),
    })

    const adyenData = await adyenRes.json()
    if (!adyenRes.ok) {
      console.error('Adyen /sessions failed', adyenData)
      await admin.from('adyen_payment_sessions')
        .update({ status: 'error', last_event: adyenData })
        .eq('id', session.id)
      return json({ error: 'Adyen session failed', detail: adyenData }, 502)
    }

    await admin.from('adyen_payment_sessions')
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
    console.error('adyen-create-session error', e)
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
