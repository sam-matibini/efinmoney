import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const ADYEN_ENV = (Deno.env.get('ADYEN_ENV') || 'test').toLowerCase()
const ADYEN_API_KEY = Deno.env.get('ADYEN_API_KEY')!
const ADYEN_MERCHANT_ACCOUNT = Deno.env.get('ADYEN_MERCHANT_ACCOUNT')!
const ADYEN_BASE = ADYEN_ENV === 'live'
  ? 'https://checkout-live.adyen.com/v71'
  : 'https://checkout-test.adyen.com/v71'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error } = await supabase.auth.getClaims(token)
    if (error || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const userId = claims.claims.sub as string

    const body = await req.json().catch(() => ({}))
    const {
      amount,
      currency,
      purpose = 'invoice',
      description,
      sales_invoice_id = null,
      customer_email = null,
      expires_in_hours = 72,
    } = body

    if (!amount || amount <= 0) return json({ error: 'Invalid amount' }, 400)
    if (!currency || currency.length !== 3) return json({ error: 'Invalid currency' }, 400)
    if (!['invoice','admin_link','wallet_topup'].includes(purpose)) return json({ error: 'Invalid purpose' }, 400)

    if (purpose === 'admin_link') {
      const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' })
      if (!isAdmin) return json({ error: 'Admin required' }, 403)
    }

    const { data: rl } = await supabase.rpc('check_rate_limit', {
      p_key: `adyen_paylink:${userId}`, p_max_requests: 20, p_window_seconds: 60,
    })
    if (rl === false) return json({ error: 'Too many requests' }, 429)

    const cur = currency.toUpperCase()
    const amountMinor = Math.round(Number(amount) * 100)
    const reference = `efin_link_${purpose}_${userId.slice(0,8)}_${Date.now()}`
    const expiresAt = new Date(Date.now() + expires_in_hours * 3600 * 1000).toISOString()

    const adyenRes = await fetch(`${ADYEN_BASE}/paymentLinks`, {
      method: 'POST',
      headers: { 'x-API-key': ADYEN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantAccount: ADYEN_MERCHANT_ACCOUNT,
        amount: { value: amountMinor, currency: cur },
        reference,
        description: description || 'eFinMoney payment',
        expiresAt,
        shopperEmail: customer_email || undefined,
        countryCode: 'CA',
        allowedPaymentMethods: ['scheme','alipay','interac_card','amex','visa','mc'],
      }),
    })
    const adyenData = await adyenRes.json()
    if (!adyenRes.ok) return json({ error: 'Adyen paylink failed', detail: adyenData }, 502)

    // Create short link
    let shortCode: string | null = null
    try {
      const { data: code } = await supabase.rpc('create_short_link', {
        p_target_path: `/pay/${adyenData.id}`,
        p_params: { url: adyenData.url },
        p_expires_at: expiresAt,
        p_max_uses: null,
      })
      shortCode = code as string
    } catch (_) {}

    const { data: row, error: insErr } = await supabase
      .from('adyen_pay_by_link')
      .insert({
        owner_user_id: userId,
        link_id: adyenData.id,
        url: adyenData.url,
        short_code: shortCode,
        reference,
        amount_minor: amountMinor,
        currency: cur,
        purpose,
        description,
        sales_invoice_id,
        customer_email,
        expires_at: expiresAt,
        raw: adyenData,
      })
      .select()
      .single()
    if (insErr) return json({ error: insErr.message }, 500)

    return json({
      id: row.id,
      link_id: adyenData.id,
      url: adyenData.url,
      short_url: shortCode ? `https://efin.money/s/${shortCode}` : adyenData.url,
      expires_at: expiresAt,
      amount: { value: amountMinor, currency: cur },
    })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
