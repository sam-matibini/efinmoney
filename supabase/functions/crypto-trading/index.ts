import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradeRequest {
  pair_id: string;
  side: 'buy' | 'sell';
  amount: number;
  amount_type: 'base' | 'quote';
}

// Mock crypto prices (in production, fetch from exchange API)
const CRYPTO_PRICES: Record<string, number> = {
  'BTC_USD': 67500.00,
  'BTC_USDT': 67480.00,
  'USDT_USD': 1.0002,
  'USDC_USD': 0.9998,
};

serve(async (req) => {
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

    // GET PAIRS - List available trading pairs
    if (req.method === 'GET' && action === 'pairs') {
      const { data: pairs, error } = await supabase
        .from('crypto_pairs')
        .select('*')
        .eq('is_active', true);

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch pairs' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Add current prices
      const pairsWithPrices = pairs.map(pair => {
        const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
        return {
          ...pair,
          current_price: CRYPTO_PRICES[priceKey] || 1,
          price_change_24h: (Math.random() - 0.5) * 5 // Mock 24h change
        };
      });

      return new Response(
        JSON.stringify({ pairs: pairsWithPrices }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET QUOTE
    if (req.method === 'POST' && action === 'quote') {
      const body: TradeRequest = await req.json();
      const { pair_id, side, amount, amount_type } = body;

      const { data: pair, error: pairError } = await supabase
        .from('crypto_pairs')
        .select('*')
        .eq('id', pair_id)
        .single();

      if (pairError || !pair) {
        return new Response(
          JSON.stringify({ error: 'Trading pair not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
      const marketPrice = CRYPTO_PRICES[priceKey] || 1;
      const tradingFee = Number(pair.trading_fee_percent);

      let baseAmount: number;
      let quoteAmount: number;
      let feeAmount: number;

      if (side === 'buy') {
        // Buying base with quote
        if (amount_type === 'quote') {
          feeAmount = amount * tradingFee;
          quoteAmount = amount;
          baseAmount = (amount - feeAmount) / marketPrice;
        } else {
          baseAmount = amount;
          quoteAmount = amount * marketPrice;
          feeAmount = quoteAmount * tradingFee;
          quoteAmount += feeAmount;
        }
      } else {
        // Selling base for quote
        if (amount_type === 'base') {
          baseAmount = amount;
          quoteAmount = amount * marketPrice;
          feeAmount = quoteAmount * tradingFee;
          quoteAmount -= feeAmount;
        } else {
          quoteAmount = amount;
          feeAmount = amount * tradingFee;
          baseAmount = (amount + feeAmount) / marketPrice;
        }
      }

      return new Response(
        JSON.stringify({
          pair_id,
          side,
          base_currency: pair.base_currency,
          quote_currency: pair.quote_currency,
          base_amount: baseAmount,
          quote_amount: quoteAmount,
          price: marketPrice,
          fee_amount: feeAmount,
          fee_currency: pair.quote_currency,
          fee_percent: tradingFee * 100,
          expires_in_seconds: 30
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // EXECUTE TRADE
    if (req.method === 'POST' && action === 'execute') {
      const body: TradeRequest = await req.json();
      const { pair_id, side, amount, amount_type } = body;

      const { data: pair, error: pairError } = await supabase
        .from('crypto_pairs')
        .select('*')
        .eq('id', pair_id)
        .single();

      if (pairError || !pair) {
        return new Response(
          JSON.stringify({ error: 'Trading pair not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get user wallets
      const { data: wallets } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId);

      const baseWallet = wallets?.find(w => w.currency_code === pair.base_currency);
      const quoteWallet = wallets?.find(w => w.currency_code === pair.quote_currency);

      // Create wallets if they don't exist
      let baseWalletId = baseWallet?.id;
      let quoteWalletId = quoteWallet?.id;

      if (!baseWallet) {
        const { data: newWallet } = await supabase
          .from('wallets')
          .insert({ user_id: userId, currency_code: pair.base_currency })
          .select()
          .single();
        baseWalletId = newWallet?.id;
      }

      if (!quoteWallet) {
        const { data: newWallet } = await supabase
          .from('wallets')
          .insert({ user_id: userId, currency_code: pair.quote_currency })
          .select()
          .single();
        quoteWalletId = newWallet?.id;
      }

      const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
      const marketPrice = CRYPTO_PRICES[priceKey] || 1;
      const tradingFee = Number(pair.trading_fee_percent);

      let baseAmount: number;
      let quoteAmount: number;
      let feeAmount: number;

      if (side === 'buy') {
        if (amount_type === 'quote') {
          feeAmount = amount * tradingFee;
          quoteAmount = amount;
          baseAmount = (amount - feeAmount) / marketPrice;
        } else {
          baseAmount = amount;
          quoteAmount = amount * marketPrice;
          feeAmount = quoteAmount * tradingFee;
          quoteAmount += feeAmount;
        }
      } else {
        if (amount_type === 'base') {
          baseAmount = amount;
          quoteAmount = amount * marketPrice;
          feeAmount = quoteAmount * tradingFee;
          quoteAmount -= feeAmount;
        } else {
          quoteAmount = amount;
          feeAmount = amount * tradingFee;
          baseAmount = (amount + feeAmount) / marketPrice;
        }
      }

      // Record the trade
      const { data: trade, error: tradeError } = await supabase
        .from('crypto_trades')
        .insert({
          user_id: userId,
          pair_id,
          side,
          base_wallet_id: baseWalletId,
          quote_wallet_id: quoteWalletId,
          base_amount: baseAmount,
          quote_amount: quoteAmount,
          price: marketPrice,
          fee_amount: feeAmount,
          fee_currency: pair.quote_currency,
          status: 'executed',
          executed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (tradeError) {
        return new Response(
          JSON.stringify({ error: 'Failed to execute trade', details: tradeError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          trade,
          message: side === 'buy' 
            ? `Bought ${baseAmount.toFixed(8)} ${pair.base_currency} for ${quoteAmount.toFixed(2)} ${pair.quote_currency}`
            : `Sold ${baseAmount.toFixed(8)} ${pair.base_currency} for ${quoteAmount.toFixed(2)} ${pair.quote_currency}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Crypto trading error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
