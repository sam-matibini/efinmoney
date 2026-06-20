import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createHmac } from 'node:crypto'
import { creditAdyenTopup } from '../_shared/adyen-credit.ts'

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

  if (req.method === 'GET') {
    return json({ ok: true, service: 'adyen-webhook', hmac_configured: Boolean(HMAC_KEY) })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const raw = await req.text()
    if (!raw.trim()) {
      return json({ '[accepted]': true, note: 'empty body — Adyen sends POST with JSON' })
    }
    const payload = JSON.parse(raw)
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

      // Find the session. Modification events (CAPTURE/CANCELLATION/REFUND) carry
      // originalReference = the original payment's psp reference, while merchantReference
      // is the modification reference (which does NOT match the session). Match on the
      // original psp reference first, then fall back to merchantReference for AUTHORISATION.
      let session: Record<string, any> | null = null
      if (data.originalReference) {
        const r = await supabase
          .from('adyen_payment_sessions')
          .select('*')
          .eq('psp_reference', data.originalReference)
          .maybeSingle()
        session = r.data
      }
      if (!session) {
        const r = await supabase
          .from('adyen_payment_sessions')
          .select('*')
          .eq('reference', data.merchantReference)
          .maybeSingle()
        session = r.data
      }

      // Process events
      const success = data.success === 'true' || data.success === true
      const code = data.eventCode

      if (session) {
        let newStatus = session.status
        if (code === 'AUTHORISATION' && success) newStatus = 'authorised'
        if (code === 'CAPTURE' && success) newStatus = 'settled'
        if (code === 'AUTHORISATION' && !success) newStatus = 'refused'
        if (code === 'CANCELLATION' && success) newStatus = 'cancelled'
        if (code === 'REFUND' && success) newStatus = 'refunded'

        const pmRaw = data.paymentMethod
        const pm = typeof pmRaw === 'string'
          ? pmRaw
          : pmRaw && typeof pmRaw === 'object'
            ? (pmRaw.brand || pmRaw.type || null)
            : null

        // Only set psp_reference from the AUTHORISATION (original payment). Modification
        // events carry the modification psp ref, which must not overwrite the original —
        // otherwise later refund/lookup by originalReference would break.
        const updates: Record<string, unknown> = {
          status: newStatus,
          payment_method: pm ?? session.payment_method,
          last_event: data,
        }
        if (code === 'AUTHORISATION') updates.psp_reference = data.pspReference
        await supabase.from('adyen_payment_sessions').update(updates).eq('id', session.id)

        // Credit ledger once. Key idempotency on the ORIGINAL psp reference so an
        // AUTHORISATION followed by a CAPTURE does not double-credit the wallet.
        const creditRef = session.psp_reference || data.pspReference
        if ((code === 'AUTHORISATION' || code === 'CAPTURE') && success && session.target_wallet_id) {
          await creditAdyenTopup(supabase, session, creditRef, pm ?? undefined)
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

    return json({ '[accepted]': true, results })
  } catch (e) {
    console.error('Adyen webhook error', e)
    return json({ '[accepted]': true, error: String(e) })
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
