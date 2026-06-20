import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const ADYEN_ENV = (Deno.env.get('ADYEN_ENV') || 'test').toLowerCase()
const ADYEN_API_KEY = (Deno.env.get('ADYEN_API_KEY') || '').trim()
const ADYEN_MERCHANT_ACCOUNT = (Deno.env.get('ADYEN_MERCHANT_ACCOUNT') || '').trim()

const ADYEN_BASE = ADYEN_ENV === 'live'
  ? 'https://checkout-live.adyen.com/v71'
  : 'https://checkout-test.adyen.com/v71'

const ACTIONS = ['capture', 'cancel', 'refund'] as const
type Action = typeof ACTIONS[number]

const ENDPOINT_FOR: Record<Action, string> = {
  capture: 'captures',
  cancel: 'cancels',
  refund: 'refunds',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!ADYEN_API_KEY || !ADYEN_MERCHANT_ACCOUNT) {
      return json({ error: 'Adyen not configured' }, 503)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token)
    if (authErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401)
    const userId = claims.claims.sub as string

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' })
    if (!isAdmin) return json({ error: 'Admin required' }, 403)

    const body = await req.json().catch(() => ({}))
    const { session_id, action } = body as { session_id?: string; action?: Action }

    if (!session_id) return json({ error: 'session_id is required' }, 400)
    if (!action || !ACTIONS.includes(action)) {
      return json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, 400)
    }

    const { data: session, error: sessErr } = await supabase
      .from('adyen_payment_sessions')
      .select('*')
      .eq('id', session_id)
      .maybeSingle()
    if (sessErr || !session) return json({ error: 'Session not found' }, 404)
    if (!session.psp_reference) {
      return json({ error: 'No psp_reference on this session yet — payment has not been authorised' }, 400)
    }

    // Adyen rules: capture/cancel only apply to an authorised (un-captured) payment;
    // refund only applies after capture (settled). Guard here so the user gets a clear
    // message instead of an async "received" that silently fails later.
    const status = session.status
    if ((action === 'capture' || action === 'cancel') && status === 'settled') {
      return json({ error: `Payment already captured — cannot ${action}. Use Refund instead.` }, 409)
    }
    if (action === 'refund' && status !== 'settled') {
      return json({ error: 'Payment is not captured yet — capture it first, then refund.' }, 409)
    }
    if ((action === 'capture' || action === 'cancel') && status === 'cancelled') {
      return json({ error: 'Payment already cancelled.' }, 409)
    }

    const reference = `${session.reference}_${action}_${Date.now()}`
    const adyenBody: Record<string, unknown> = {
      merchantAccount: ADYEN_MERCHANT_ACCOUNT,
      reference,
    }
    if (action === 'capture' || action === 'refund') {
      adyenBody.amount = { value: session.amount_minor, currency: session.currency }
    }

    const adyenRes = await fetch(`${ADYEN_BASE}/payments/${session.psp_reference}/${ENDPOINT_FOR[action]}`, {
      method: 'POST',
      headers: { 'x-API-key': ADYEN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(adyenBody),
    })
    const adyenData = await adyenRes.json()
    if (!adyenRes.ok) {
      return json({ error: `Adyen ${action} failed`, detail: adyenData }, 502)
    }

    await supabase.from('adyen_payment_sessions').update({
      last_event: { ...session.last_event, [`${action}_request`]: adyenData },
    }).eq('id', session.id)

    return json({ action, reference, adyen: adyenData })
  } catch (e) {
    console.error('adyen-modify-payment error', e)
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
