import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting configuration
const RATE_LIMITS = {
  'pairs': { requests: 30, window: 60 },      // 30 per minute
  'quote': { requests: 20, window: 60 },      // 20 per minute
  'execute': { requests: 10, window: 300 }    // 10 per 5 minutes
};

// Validation helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SIDES = ['buy', 'sell'] as const;
const VALID_AMOUNT_TYPES = ['base', 'quote'] as const;
const MAX_TRADE_AMOUNT = 1000000;
const MIN_TRADE_AMOUNT = 0.00000001;

function isValidUUID(str: string): boolean {
  return typeof str === 'string' && UUID_REGEX.test(str);
}

function isValidAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && 
         !isNaN(amount) && 
         isFinite(amount) && 
         amount >= MIN_TRADE_AMOUNT && 
         amount <= MAX_TRADE_AMOUNT;
}

function isValidSide(side: unknown): side is 'buy' | 'sell' {
  return typeof side === 'string' && VALID_SIDES.includes(side as 'buy' | 'sell');
}

function isValidAmountType(type: unknown): type is 'base' | 'quote' {
  return typeof type === 'string' && VALID_AMOUNT_TYPES.includes(type as 'base' | 'quote');
}

interface TradeRequest {
  pair_id: string;
  side: 'buy' | 'sell';
  amount: number;
  amount_type: 'base' | 'quote';
}

function validateTradeRequest(body: unknown): { valid: true; data: TradeRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const { pair_id, side, amount, amount_type } = body as Record<string, unknown>;
  
  if (!pair_id || !isValidUUID(pair_id as string)) {
    return { valid: false, error: 'Invalid pair_id: must be a valid UUID' };
  }
  
  if (!isValidSide(side)) {
    return { valid: false, error: 'Invalid side: must be "buy" or "sell"' };
  }
  
  if (!isValidAmount(amount)) {
    return { valid: false, error: `Invalid amount: must be a number between ${MIN_TRADE_AMOUNT} and ${MAX_TRADE_AMOUNT}` };
  }
  
  if (!isValidAmountType(amount_type)) {
    return { valid: false, error: 'Invalid amount_type: must be "base" or "quote"' };
  }
  
  return { 
    valid: true, 
    data: { pair_id: pair_id as string, side, amount: amount as number, amount_type } 
  };
}

// Price cache
interface PriceCache {
  prices: Record<string, number>;
  timestamp: number;
}

let priceCache: PriceCache = { prices: {}, timestamp: 0 };
const PRICE_CACHE_TTL_MS = 30000;
const MAX_TRADE_AMOUNT_USD = 10000;

async function fetchCryptoPrices(): Promise<Record<string, number>> {
  const now = Date.now();
  
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
      'BTC_USDT': data.bitcoin?.usd || 0,
      'USDT_USD': data.tether?.usd || 1.0,
      'USDC_USD': data['usd-coin']?.usd || 1.0,
    };
    
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
    
    if (priceCache.timestamp > 0 && now - priceCache.timestamp < 300000) {
      console.warn('Using stale cached prices due to API failure');
      return priceCache.prices;
    }
    
    throw new Error('Unable to fetch current crypto prices. Trading is temporarily unavailable.');
  }
}

// Rate limiting helper
async function checkRateLimit(
  supabase: any,
  userId: string,
  action: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limit = RATE_LIMITS[action as keyof typeof RATE_LIMITS];
  if (!limit) return { allowed: true };
  
  const key = `crypto-trading:${action}:${userId}`;
  
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max_requests: limit.requests,
    p_window_seconds: limit.window
  });
  
  if (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true }; // Fail open on rate limit errors
  }
  
  return { 
    allowed: data === true,
    retryAfter: data === false ? limit.window : undefined
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
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
    
    // Service role client for rate limiting
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

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

    // GET PAIRS
    if (req.method === 'GET' && action === 'pairs') {
      // Check rate limit
      const rateCheck = await checkRateLimit(serviceClient, userId, 'pairs');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter || 60) } }
        );
      }

      const { data: pairs, error } = await supabase
        .from('crypto_pairs')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('Failed to fetch pairs:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch trading pairs' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let cryptoPrices: Record<string, number>;
      try {
        cryptoPrices = await fetchCryptoPrices();
      } catch (priceError) {
        console.error('Price fetch error:', priceError);
        return new Response(
          JSON.stringify({ error: 'Price service temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pairsWithPrices = pairs.map(pair => {
        const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
        const price = cryptoPrices[priceKey];
        if (!price || price <= 0) {
          console.warn(`No valid price for pair ${priceKey}`);
        }
        return {
          ...pair,
          current_price: price || null,
          price_available: !!price && price > 0,
          price_change_24h: 0
        };
      });

      return new Response(
        JSON.stringify({ pairs: pairsWithPrices }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET QUOTE
    if (req.method === 'POST' && action === 'quote') {
      // Check rate limit
      const rateCheck = await checkRateLimit(serviceClient, userId, 'quote');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter || 60) } }
        );
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const validation = validateTradeRequest(body);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { pair_id, side, amount, amount_type } = validation.data;

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

      let cryptoPrices: Record<string, number>;
      try {
        cryptoPrices = await fetchCryptoPrices();
      } catch (priceError) {
        console.error('Price fetch error:', priceError);
        return new Response(
          JSON.stringify({ error: 'Price service temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
      const marketPrice = cryptoPrices[priceKey];
      
      if (!marketPrice || marketPrice <= 0) {
        return new Response(
          JSON.stringify({ error: `Price unavailable for ${priceKey}. Trading temporarily disabled.` }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tradingFee = Number(pair.trading_fee_percent);
      let baseAmount: number, quoteAmount: number, feeAmount: number;

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

      return new Response(
        JSON.stringify({
          pair_id, side,
          base_currency: pair.base_currency,
          quote_currency: pair.quote_currency,
          base_amount: baseAmount, quote_amount: quoteAmount,
          price: marketPrice, fee_amount: feeAmount,
          fee_currency: pair.quote_currency,
          fee_percent: tradingFee * 100,
          expires_in_seconds: 30
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // EXECUTE TRADE
    if (req.method === 'POST' && action === 'execute') {
      // Check rate limit - stricter for executions
      const rateCheck = await checkRateLimit(serviceClient, userId, 'execute');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. You can execute a maximum of 10 trades every 5 minutes.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter || 300) } }
        );
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const validation = validateTradeRequest(body);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { pair_id, side, amount, amount_type } = validation.data;

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

      const { data: wallets } = await supabase.from('wallets').select('*').eq('user_id', userId);
      const baseWallet = wallets?.find(w => w.currency_code === pair.base_currency);
      const quoteWallet = wallets?.find(w => w.currency_code === pair.quote_currency);

      let baseWalletId = baseWallet?.id;
      let quoteWalletId = quoteWallet?.id;

      if (!baseWallet) {
        const { data: newWallet } = await supabase.from('wallets').insert({ user_id: userId, currency_code: pair.base_currency }).select().single();
        baseWalletId = newWallet?.id;
      }

      if (!quoteWallet) {
        const { data: newWallet } = await supabase.from('wallets').insert({ user_id: userId, currency_code: pair.quote_currency }).select().single();
        quoteWalletId = newWallet?.id;
      }

      let cryptoPrices: Record<string, number>;
      try {
        cryptoPrices = await fetchCryptoPrices();
      } catch (priceError) {
        console.error('Price fetch error:', priceError);
        return new Response(
          JSON.stringify({ error: 'Price service temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const priceKey = `${pair.base_currency}_${pair.quote_currency}`;
      const marketPrice = cryptoPrices[priceKey];
      
      if (!marketPrice || marketPrice <= 0) {
        return new Response(
          JSON.stringify({ error: `Price unavailable for ${priceKey}. Trading temporarily disabled.` }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tradingFee = Number(pair.trading_fee_percent);
      const estimatedUsdValue = amount_type === 'quote' ? amount : amount * marketPrice;
      
      if (estimatedUsdValue > MAX_TRADE_AMOUNT_USD) {
        return new Response(
          JSON.stringify({ error: `Trade amount exceeds maximum limit of $${MAX_TRADE_AMOUNT_USD.toLocaleString()}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let baseAmount: number, quoteAmount: number, feeAmount: number;

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

      const { data: trade, error: tradeError } = await supabase
        .from('crypto_trades')
        .insert({
          user_id: userId, pair_id, side,
          base_wallet_id: baseWalletId, quote_wallet_id: quoteWalletId,
          base_amount: baseAmount, quote_amount: quoteAmount,
          price: marketPrice, fee_amount: feeAmount,
          fee_currency: pair.quote_currency,
          status: 'executed', executed_at: new Date().toISOString()
        })
        .select().single();

      if (tradeError) {
        console.error('Trade execution error:', tradeError);
        return new Response(
          JSON.stringify({ error: 'Failed to execute trade. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true, trade,
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
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
