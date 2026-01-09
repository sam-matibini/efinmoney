import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FxQuoteRequest {
  from_currency: string;
  to_currency: string;
  amount: number;
}

interface FxExecuteRequest {
  from_wallet_id: string;
  to_wallet_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    
    if (claimsError || !claimsData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;
    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    // GET QUOTE - Lock rate for 60 seconds
    if (req.method === 'POST' && action === 'quote') {
      const body: FxQuoteRequest = await req.json();
      const { from_currency, to_currency, amount } = body;

      // Validate input
      if (!from_currency || !to_currency || !amount || amount <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid request parameters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get current FX rate
      const { data: rateData, error: rateError } = await supabase
        .from('fx_rates')
        .select('*')
        .eq('from_currency', from_currency)
        .eq('to_currency', to_currency)
        .is('valid_until', null)
        .single();

      if (rateError || !rateData) {
        // Try reverse rate
        const { data: reverseRate } = await supabase
          .from('fx_rates')
          .select('*')
          .eq('from_currency', to_currency)
          .eq('to_currency', from_currency)
          .is('valid_until', null)
          .single();

        if (!reverseRate) {
          return new Response(
            JSON.stringify({ error: 'Exchange rate not available for this pair' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calculate inverse rate
        const inverseRate = 1 / Number(reverseRate.effective_rate);
        const fee = amount * 0.005; // 0.5% fee
        const toAmount = (amount - fee) * inverseRate;

        return new Response(
          JSON.stringify({
            from_currency,
            to_currency,
            from_amount: amount,
            to_amount: toAmount,
            market_rate: 1 / Number(reverseRate.rate),
            markup_rate: Number(reverseRate.markup_rate),
            effective_rate: inverseRate,
            fee_amount: fee,
            rate_locked_until: new Date(Date.now() + 60000).toISOString(),
            expires_in_seconds: 60
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const marketRate = Number(rateData.rate);
      const markupRate = Number(rateData.markup_rate);
      const effectiveRate = Number(rateData.effective_rate);
      const fee = amount * 0.005; // 0.5% fee
      const toAmount = (amount - fee) * effectiveRate;

      return new Response(
        JSON.stringify({
          from_currency,
          to_currency,
          from_amount: amount,
          to_amount: toAmount,
          market_rate: marketRate,
          markup_rate: markupRate,
          effective_rate: effectiveRate,
          fee_amount: fee,
          rate_locked_until: new Date(Date.now() + 60000).toISOString(),
          expires_in_seconds: 60
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // EXECUTE SWAP
    if (req.method === 'POST' && action === 'execute') {
      const body: FxExecuteRequest = await req.json();
      const { from_wallet_id, to_wallet_id, from_currency, to_currency, from_amount } = body;

      // Validate wallets belong to user
      const { data: fromWallet, error: fromError } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', from_wallet_id)
        .eq('user_id', userId)
        .single();

      if (fromError || !fromWallet) {
        return new Response(
          JSON.stringify({ error: 'Source wallet not found or unauthorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: toWallet, error: toError } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', to_wallet_id)
        .eq('user_id', userId)
        .single();

      if (toError || !toWallet) {
        return new Response(
          JSON.stringify({ error: 'Destination wallet not found or unauthorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get FX rate
      const { data: rateData } = await supabase
        .from('fx_rates')
        .select('*')
        .eq('from_currency', from_currency)
        .eq('to_currency', to_currency)
        .is('valid_until', null)
        .single();

      if (!rateData) {
        return new Response(
          JSON.stringify({ error: 'Exchange rate not available' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const effectiveRate = Number(rateData.effective_rate);
      const fee = from_amount * 0.005;
      const toAmount = (from_amount - fee) * effectiveRate;

      // Execute the swap using the database function
      const { data: journalId, error: swapError } = await supabase.rpc('execute_fx_swap', {
        p_user_id: userId,
        p_from_wallet_id: from_wallet_id,
        p_to_wallet_id: to_wallet_id,
        p_from_amount: from_amount,
        p_effective_rate: effectiveRate,
        p_fee_amount: fee
      });

      if (swapError) {
        console.error('FX swap error:', swapError);
        return new Response(
          JSON.stringify({ error: 'Failed to execute swap', details: swapError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Record the FX transaction
      const { data: fxTransaction, error: txError } = await supabase
        .from('fx_transactions')
        .insert({
          user_id: userId,
          from_wallet_id,
          to_wallet_id,
          from_currency,
          to_currency,
          from_amount,
          to_amount: toAmount,
          market_rate: Number(rateData.rate),
          markup_rate: Number(rateData.markup_rate),
          effective_rate: effectiveRate,
          fee_amount: fee,
          rate_expires_at: new Date(Date.now() + 60000).toISOString(),
          status: 'executed',
          journal_id: journalId,
          executed_at: new Date().toISOString()
        })
        .select()
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          transaction: fxTransaction,
          message: `Successfully exchanged ${from_amount} ${from_currency} to ${toAmount.toFixed(2)} ${to_currency}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('FX Engine error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
