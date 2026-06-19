import { createClient } from 'npm:@supabase/supabase-js@2'

type Admin = ReturnType<typeof createClient>

export async function creditAdyenTopup(
  admin: Admin,
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
    const fallback = await admin.from('ledger_accounts')
      .select('id')
      .like('code', '11%')
      .eq('currency_code', currency)
      .limit(1)
      .maybeSingle()
    clearing = fallback.data
  }

  const { data: liability } = await admin.from('ledger_accounts')
    .select('id')
    .like('code', '21%')
    .eq('currency_code', currency)
    .ilike('name', 'Customer Wallet Liability%')
    .limit(1)
    .maybeSingle()

  if (!clearing?.id || !liability?.id) {
    console.error('Missing ledger accounts for Adyen top-up', currency, {
      clearing: !!clearing?.id,
      liability: !!liability?.id,
    })
    return { credited: false, error: `Missing ledger accounts for ${currency}` }
  }

  const desc = `Adyen top-up (${pspReference})${paymentMethod ? ` — ${paymentMethod}` : ''}`
  const { error: insertErr } = await admin.from('ledger_entries').insert([
    {
      journal_id: journalId,
      account_id: clearing.id,
      wallet_id: null,
      currency_code: currency,
      debit_amount: amountMajor,
      credit_amount: 0,
      description: desc,
      reference_type: refType,
      external_reference: pspReference,
      created_by: session.user_id,
    },
    {
      journal_id: journalId,
      account_id: liability.id,
      wallet_id: session.target_wallet_id,
      currency_code: currency,
      debit_amount: 0,
      credit_amount: amountMajor,
      description: desc,
      reference_type: refType,
      external_reference: pspReference,
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
