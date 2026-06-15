import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createHmac } from 'node:crypto'

const HMAC_KEY = Deno.env.get('ADYEN_HMAC_KEY') || ''

// Adyen HMAC signature calculation per docs
function calcHmac(item: any, hmacKeyHex: string): string {
  const data = item.NotificationRequestItem
  const fields = [
    data.pspReference || '',
    data.originalReference || '',
    data.merchantAccountCode || '',
    data.merchantReference || '',
    String(data.amount?.value ?? ''),
    data.amount?.currency || '',
    data.eventCode || '',
    String(data.success ?? ''),
  ]
  const signingString = fields.map(escape).join(':')
  const key = Uint8Array.from(hmacKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
  const h = createHmac('sha256', key).update(signingString).digest('base64')
  return h
}
function escape(s: string) {
  return String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const payload = await req.json()
    const items = payload?.notificationItems || []
    const results: any[] = []

    for (const item of items) {
      const data = item.NotificationRequestItem
      if (!data) continue

      const providedSig = data.additionalData?.hmacSignature || ''
      const expectedSig = HMAC_KEY ? calcHmac(item, HMAC_KEY) : ''
      const hmacValid = HMAC_KEY ? providedSig === expectedSig : false

      // Idempotency insert
      const { error: dupErr } = await supabase.from('adyen_webhook_events').insert({
        event_code: data.eventCode,
        psp_reference: data.pspReference,
        merchant_reference: data.merchantReference,
        success: data.success === 'true' || data.success === true,
        hmac_valid: hmacValid,
        amount_minor: data.amount?.value ?? null,
        currency: data.amount?.currency ?? null,
        payment_method: data.paymentMethod ?? null,
        raw: data,
        processed_at: new Date().toISOString(),
      })

      if (dupErr && !dupErr.message.includes('duplicate')) {
        results.push({ ref: data.pspReference, error: dupErr.message })
        continue
      }
      if (dupErr) {
        results.push({ ref: data.pspReference, skipped: 'duplicate' })
        continue
      }

      if (!hmacValid) {
        results.push({ ref: data.pspReference, hmac: 'invalid' })
        continue
      }

      // Find session by merchantReference
      const { data: session } = await supabase
        .from('adyen_payment_sessions')
        .select('*')
        .eq('reference', data.merchantReference)
        .maybeSingle()

      // Process events
      const success = data.success === 'true' || data.success === true
      const code = data.eventCode

      if (session) {
        let newStatus = session.status
        if (code === 'AUTHORISATION' && success) newStatus = 'authorised'
        if (code === 'CAPTURE' && success) newStatus = 'settled'
        if (code === 'AUTHORISATION' && !success) newStatus = 'refused'
        if (code === 'CANCELLATION') newStatus = 'cancelled'
        if (code === 'REFUND' && success) newStatus = 'refunded'

        await supabase.from('adyen_payment_sessions').update({
          status: newStatus,
          psp_reference: data.pspReference,
          payment_method: data.paymentMethod ?? session.payment_method,
          last_event: data,
        }).eq('id', session.id)

        // Credit ledger on first authorised/settled (treat AUTHORISATION+success as funds available in test)
        if ((code === 'AUTHORISATION' || code === 'CAPTURE') && success && session.target_wallet_id) {
          await creditWallet(supabase, session, data)
        }

        // Mark related invoice paid
        if (success && session.related_invoice_id && (code === 'AUTHORISATION' || code === 'CAPTURE')) {
          await supabase.from('sales_invoices').update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', session.related_invoice_id)
        }
      }

      // Pay-by-link
      const { data: link } = await supabase
        .from('adyen_pay_by_link')
        .select('*')
        .eq('reference', data.merchantReference)
        .maybeSingle()
      if (link && success && (code === 'AUTHORISATION' || code === 'CAPTURE')) {
        await supabase.from('adyen_pay_by_link').update({
          status: 'paid', psp_reference: data.pspReference,
        }).eq('id', link.id)
        if (link.sales_invoice_id) {
          await supabase.from('sales_invoices').update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', link.sales_invoice_id)
        }
      }

      results.push({ ref: data.pspReference, code, processed: true })
    }

    return new Response(JSON.stringify({ '[accepted]': true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Adyen webhook error', e)
    return new Response(JSON.stringify({ '[accepted]': true, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function creditWallet(supabase: any, session: any, data: any) {
  // Idempotency: skip if a journal already references this psp_reference
  const refType = `adyen:${data.pspReference}`
  const { data: existing } = await supabase
    .from('ledger_entries')
    .select('id')
    .eq('reference_type', refType)
    .limit(1)
  if (existing && existing.length > 0) return

  const amountMajor = Number(session.amount_minor) / 100
  const journalId = crypto.randomUUID()

  // Find Adyen clearing account for currency
  const { data: clearing } = await supabase.from('ledger_accounts')
    .select('id').eq('code', '1108').eq('currency_code', session.currency).maybeSingle()
  const { data: liability } = await supabase.from('ledger_accounts')
    .select('id').like('code', '21%').eq('currency_code', session.currency).maybeSingle()

  if (!clearing?.id || !liability?.id) {
    console.error('Missing ledger accounts for', session.currency)
    return
  }

  await supabase.from('ledger_entries').insert([
    {
      journal_id: journalId, account_id: clearing.id, wallet_id: null,
      currency_code: session.currency, debit_amount: amountMajor, credit_amount: 0,
      description: `Adyen settlement ${data.paymentMethod || ''}`, reference_type: refType,
      created_by: session.user_id,
    },
    {
      journal_id: journalId, account_id: liability.id, wallet_id: session.target_wallet_id,
      currency_code: session.currency, debit_amount: 0, credit_amount: amountMajor,
      description: `Wallet top-up via Adyen`, reference_type: refType,
      created_by: session.user_id,
    },
  ])

  // FX swap to target currency if different
  if (session.target_currency && session.target_currency !== session.currency) {
    try {
      // Find user's wallet in target currency
      const { data: defaultWallet } = await supabase.from('wallets').select('id')
        .eq('user_id', session.user_id).eq('currency_code', session.target_currency)
        .maybeSingle()
      if (defaultWallet?.id && session.target_wallet_id !== defaultWallet.id) {
        // Fetch rate
        const { data: rate } = await supabase.from('fx_rates').select('rate,markup_pct')
          .eq('from_currency', session.currency).eq('to_currency', session.target_currency)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (rate?.rate) {
          const effective = Number(rate.rate) * (1 - Number(rate.markup_pct || 0) / 100)
          await supabase.rpc('execute_fx_swap', {
            p_user_id: session.user_id,
            p_from_wallet_id: session.target_wallet_id,
            p_to_wallet_id: defaultWallet.id,
            p_from_amount: amountMajor,
            p_effective_rate: effective,
            p_fee_amount: 0,
          })
        }
      }
    } catch (e) {
      console.error('Auto FX failed', e)
    }
  }

  // Notification
  await supabase.from('notifications').insert({
    user_id: session.user_id,
    title: 'Wallet Topped Up',
    message: `Your wallet has been credited ${amountMajor} ${session.currency} via Adyen.`,
    type: 'wallet',
    is_read: false,
  })
}
