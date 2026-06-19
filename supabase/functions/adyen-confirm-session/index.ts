import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const ADYEN_ENV = (Deno.env.get('ADYEN_ENV') || 'test').toLowerCase()
const ADYEN_API_KEY = (Deno.env.get('ADYEN_API_KEY') || '').trim()
const ADYEN_BASE = ADYEN_ENV === 'live'
  ? 'https://checkout-live.adyen.com/v71'
  : 'https://checkout-test.adyen.com/v71'

async function creditAdyenTopup(
  admin: ReturnType<typeof createClient>,
  session: {
    user_id: string
    target_wallet_id: string | null
    amount_minor: number
    currency: string
  },
  pspReference: string,
  paymentMethod?: string,
) {
  if (!session.target_wallet_id) {
    return { credited: false, error: 'No target wallet on payment session' }
  }

  const refType = 'adyen_topup'
  const { data: existing } = await admin
    .from('ledger_entries')
    .select('id')
    .eq('reference_type', refType)
    .eq('external_reference', pspReference)
    .limit(1)
  if (existing?.length) return { credited: false, already: true }

  const amountMajor = Number(session.amount_minor) / 100
  const currency = String(session.currency).toUpperCase()
  const journalId = crypto.randomUUID()

  let { data: clearing } = await admin.from('ledger_accounts')
    .select('id')
    .eq('currency_code', currency)
    .ilike('name', 'Adyen Settlement%')
    .limit(1)
    .maybeSingle()

  if (!clearing?.id) {
    const { data: fallback } = await admin.from('ledger_accounts')
      .select('id')
      .like('code', '11%')
      .eq('currency_code', currency)
      .limit(1)
      .maybeSingle()
    clearing = fallback
  }

  const { data: liability } = await admin.from('ledger_accounts')
    .select('id')
    .like('code', '21%')
    .eq('currency_code', currency)
    .ilike('name', 'Customer Wallet Liability%')
    .limit(1)
    .maybeSingle()

  if (!clearing?.id || !liability?.id) {
    console.error('Missing ledger accounts for Adyen top-up', currency)
    return { credited: false, error: `Missing ledger accounts for ${currency}` }
  }

  const desc = `Adyen top-up (${pspReference})${paymentMethod ? ` — ${paymentMethod}` : ''}`
  const { error: insertErr } = await admin.from('ledger_entries').insert([
    {
      journal_id: journalId, account_id: clearing.id, wallet_id: null,
      currency_code: currency, debit_amount: amountMajor, credit_amount: 0,
      description: desc, reference_type: refType, external_reference: pspReference,
      created_by: session.user_id,
    },
    {
      journal_id: journalId, account_id: liability.id, wallet_id: session.target_wallet_id,
      currency_code: currency, debit_amount: 0, credit_amount: amountMajor,
      description: desc, reference_type: refType, external_reference: pspReference,
      created_by: session.user_id,
    },
  ])
  if (insertErr) {
    console.error('Adyen ledger insert failed', insertErr)
    return { credited: false, error: insertErr.message }
  }

  await admin.from('notifications').insert({
    user_id: session.user_id,
    title: 'Wallet Topped Up',
    message: `Your wallet has been credited ${amountMajor} ${currency} via Adyen.`,
    type: 'wallet',
    is_read: false,
  })

  return { credited: true, amount: amountMajor, currency }
}

function paymentSucceeded(adyenSession: Record<string, unknown>): boolean {
  if (adyenSession.status === 'completed') return true
  const payments = adyenSession.payments as Array<Record<string, unknown>> | undefined
  if (!payments?.length) return false
  return payments.some((p) => {
    const code = String(p.resultCode || '')
    return code === 'Authorised' || code === 'Received' || code === 'Pending'
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!ADYEN_API_KEY) {
      return json({ error: 'Adyen not configured' }, 503)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authErr } = await userClient.auth.getUser(token)
    const userId = userData?.user?.id
    if (authErr || !userId) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const sessionId = String(body.sessionId || '').trim()
    const sessionResult = body.sessionResult ? String(body.sessionResult) : null
    if (!sessionId) return json({ error: 'sessionId required' }, 400)

    const { data: sessions } = await admin
      .from('adyen_payment_sessions')
      .select('*')
      .eq('user_id', userId)
      .contains('raw_session', { id: sessionId })
      .order('created_at', { ascending: false })
      .limit(1)

    const session = sessions?.[0]
    if (!session) return json({ error: 'Payment session not found' }, 404)

    const query = sessionResult
      ? `?sessionResult=${encodeURIComponent(sessionResult)}`
      : ''
    const adyenRes = await fetch(`${ADYEN_BASE}/sessions/${sessionId}${query}`, {
      headers: { 'x-API-key': ADYEN_API_KEY },
    })
    const adyenSession = await adyenRes.json()
    if (!adyenRes.ok) {
      console.error('Adyen session lookup failed', adyenSession)
      return json({ error: 'Could not verify payment with Adyen', detail: adyenSession }, 502)
    }

    if (!paymentSucceeded(adyenSession)) {
      return json({
        verified: false,
        status: adyenSession.status,
        resultCode: adyenSession.payments?.[0]?.resultCode,
      })
    }

    const payments = adyenSession.payments as Array<Record<string, unknown>> | undefined
    const pspReference = String(
      payments?.[0]?.pspReference || session.psp_reference || sessionId,
    )
    const paymentMethod = String(payments?.[0]?.paymentMethod || session.payment_method || '')

    await admin.from('adyen_payment_sessions').update({
      status: 'authorised',
      psp_reference: pspReference,
      payment_method: paymentMethod || null,
      last_event: adyenSession,
    }).eq('id', session.id)

    const credit = await creditAdyenTopup(admin, session, pspReference, paymentMethod)

    return json({
      verified: true,
      status: adyenSession.status,
      resultCode: payments?.[0]?.resultCode,
      credited: credit.credited,
      already: credit.already ?? false,
      credit_error: credit.error ?? null,
      amount: credit.amount ?? Number(session.amount_minor) / 100,
      currency: credit.currency ?? session.currency,
    })
  } catch (e) {
    console.error('adyen-confirm-session error', e)
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
