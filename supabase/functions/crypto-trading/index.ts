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

// Price cache with timestamp for staleness check
interface PriceCache {
  prices: Record<string, number>;
  timestamp: number;
}

let priceCache: PriceCache = {
  prices: {},
  timestamp: 0
};

const PRICE_CACHE_TTL_MS = 30000; // 30 seconds max staleness
const MAX_TRADE_AMOUNT_USD = 10000; // Maximum trade limit for safety

// Fetch real-time prices from CoinGecko
async function fetchCryptoPrices(): Promise<Record<string, number>> {
  const now = Date.now();
  
  // Return cached prices if still fresh
  if (now - priceCache.timestamp < PRICE_CACHE_TTL_MS && Object.keys(priceCache.prices).length > 0) {
    return priceCache.prices;
  }
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether,usd-coin&vs_currencies=usd',
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const newPrices: Record<string, number> = {
      'BTC_USD': data.bitcoin?.usd || 0,
      'BTC_USDT': data.bitcoin?.usd || 0, // BTC/USDT approximates BTC/USD
      'USDT_USD': data.tether?.usd || 1.0,
      'USDC_USD': data['usd-coin']?.usd || 1.0,
    };
    
    // Validate prices are reasonable (non-zero, not NaN)
    for (const [key, value] of Object.entries(newPrices)) {
      if (!value || isNaN(value) || value <= 0) {
        throw new Error(`Invalid price for ${key}: ${value}`);
      }
    }
    
    priceCache = { prices: newPrices, timestamp: now };
    console.log('Fetched fresh crypto prices:', newPrices);
    return newPrices;
  } catch (error) {
    console.error('Failed to fetch crypto prices:', error);
    
    // If cache exists and is less than 5 minutes old, use it with warning
    if (priceCache.timestamp > 0 && now - priceCache.timestamp < 300000) {
      console.warn('Using stale cached prices due to API failure');
      return priceCache.prices;
    }
    
    // No valid prices available
    throw new Error('Unable to fetch current crypto prices. Trading is temporarily unavailable.');
  }
}

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

      // Fetch real-time prices
      let cryptoPrices: Record<string, number>;
      try {
        cryptoPrices = await fetchCryptoPrices();
      } catch (priceError) {
        return new Response(
          JSON.stringify({ error: 'Price service temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Add current prices
      const pairsWithPrices = pairs.map(pair => {
        const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
        return {
          ...pair,
          current_price: cryptoPrices[priceKey] || 1,
          price_change_24h: 0 // Would need historical data for real 24h change
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

      // Fetch real-time prices
      let cryptoPrices: Record<string, number>;
      try {
        cryptoPrices = await fetchCryptoPrices();
      } catch (priceError) {
        return new Response(
          JSON.stringify({ error: 'Price service temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
      const marketPrice = cryptoPrices[priceKey] || 1;
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

      // Fetch real-time prices
      let cryptoPrices: Record<string, number>;
      try {
        cryptoPrices = await fetchCryptoPrices();
      } catch (priceError) {
        return new Response(
          JSON.stringify({ error: 'Price service temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
      const marketPrice = cryptoPrices[priceKey] || 1;
      const tradingFee = Number(pair.trading_fee_percent);

      // Validate trade amount limits
      const estimatedUsdValue = amount_type === 'quote' ? amount : amount * marketPrice;
      if (estimatedUsdValue > MAX_TRADE_AMOUNT_USD) {
        return new Response(
          JSON.stringify({ 
            error: `Trade amount exceeds maximum limit of $${MAX_TRADE_AMOUNT_USD.toLocaleString()}` 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
