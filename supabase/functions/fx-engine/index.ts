import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting configuration
const RATE_LIMITS = {
  'quote': { requests: 20, window: 60 },      // 20 per minute
  'execute': { requests: 10, window: 300 }    // 10 per 5 minutes
};

// Validation helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY_CODE_REGEX = /^[A-Z]{3,4}$/;
const MAX_AMOUNT = 1000000;
const MIN_AMOUNT = 0.01;

function isValidUUID(str: unknown): str is string {
  return typeof str === 'string' && UUID_REGEX.test(str);
}

function isValidCurrencyCode(str: unknown): str is string {
  return typeof str === 'string' && CURRENCY_CODE_REGEX.test(str);
}

function isValidAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && 
         !isNaN(amount) && 
         isFinite(amount) && 
         amount >= MIN_AMOUNT && 
         amount <= MAX_AMOUNT;
}

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

function validateQuoteRequest(body: unknown): { valid: true; data: FxQuoteRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const { from_currency, to_currency, amount } = body as Record<string, unknown>;
  
  if (!isValidCurrencyCode(from_currency)) {
    return { valid: false, error: 'Invalid from_currency: must be 3-4 uppercase letters' };
  }
  
  if (!isValidCurrencyCode(to_currency)) {
    return { valid: false, error: 'Invalid to_currency: must be 3-4 uppercase letters' };
  }
  
  if (!isValidAmount(amount)) {
    return { valid: false, error: `Invalid amount: must be a number between ${MIN_AMOUNT} and ${MAX_AMOUNT}` };
  }
  
  return { valid: true, data: { from_currency, to_currency, amount: amount as number } };
}

function validateExecuteRequest(body: unknown): { valid: true; data: FxExecuteRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const { from_wallet_id, to_wallet_id, from_currency, to_currency, from_amount } = body as Record<string, unknown>;
  
  if (!isValidUUID(from_wallet_id)) {
    return { valid: false, error: 'Invalid from_wallet_id: must be a valid UUID' };
  }
  
  if (!isValidUUID(to_wallet_id)) {
    return { valid: false, error: 'Invalid to_wallet_id: must be a valid UUID' };
  }
  
  if (!isValidCurrencyCode(from_currency)) {
    return { valid: false, error: 'Invalid from_currency: must be 3-4 uppercase letters' };
  }
  
  if (!isValidCurrencyCode(to_currency)) {
    return { valid: false, error: 'Invalid to_currency: must be 3-4 uppercase letters' };
  }
  
  if (!isValidAmount(from_amount)) {
    return { valid: false, error: `Invalid from_amount: must be a number between ${MIN_AMOUNT} and ${MAX_AMOUNT}` };
  }
  
  return { valid: true, data: { from_wallet_id, to_wallet_id, from_currency, to_currency, from_amount: from_amount as number } };
}

// Rate limiting helper
async function checkRateLimit(
  supabase: any,
  userId: string,
  action: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limit = RATE_LIMITS[action as keyof typeof RATE_LIMITS];
  if (!limit) return { allowed: true };
  
  const key = `fx-engine:${action}:${userId}`;
  
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max_requests: limit.requests,
    p_window_seconds: limit.window
  });
  
  if (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true };
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

      const validation = validateQuoteRequest(body);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { from_currency, to_currency, amount } = validation.data;

      const { data: rateData, error: rateError } = await supabase
        .from('fx_rates')
        .select('*')
        .eq('from_currency', from_currency)
        .eq('to_currency', to_currency)
        .is('valid_until', null)
        .single();

      if (rateError || !rateData) {
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

        const inverseRate = 1 / Number(reverseRate.effective_rate);
        const fee = amount * 0.005;
        const toAmount = (amount - fee) * inverseRate;

        return new Response(
          JSON.stringify({
            from_currency, to_currency, from_amount: amount, to_amount: toAmount,
            market_rate: 1 / Number(reverseRate.rate),
            markup_rate: Number(reverseRate.markup_rate),
            effective_rate: inverseRate, fee_amount: fee,
            rate_locked_until: new Date(Date.now() + 60000).toISOString(),
            expires_in_seconds: 60
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const marketRate = Number(rateData.rate);
      const markupRate = Number(rateData.markup_rate);
      const effectiveRate = Number(rateData.effective_rate);
      const fee = amount * 0.005;
      const toAmount = (amount - fee) * effectiveRate;

      return new Response(
        JSON.stringify({
          from_currency, to_currency, from_amount: amount, to_amount: toAmount,
          market_rate: marketRate, markup_rate: markupRate,
          effective_rate: effectiveRate, fee_amount: fee,
          rate_locked_until: new Date(Date.now() + 60000).toISOString(),
          expires_in_seconds: 60
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // EXECUTE SWAP
    if (req.method === 'POST' && action === 'execute') {
      // Check rate limit - stricter for executions
      const rateCheck = await checkRateLimit(serviceClient, userId, 'execute');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. You can execute a maximum of 10 swaps every 5 minutes.' }),
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

      const validation = validateExecuteRequest(body);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { from_wallet_id, to_wallet_id, from_currency, to_currency, from_amount } = validation.data;

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
          JSON.stringify({ error: 'Failed to execute swap. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: fxTransaction, error: txError } = await supabase
        .from('fx_transactions')
        .insert({
          user_id: userId, from_wallet_id, to_wallet_id, from_currency, to_currency, from_amount,
          to_amount: toAmount, market_rate: Number(rateData.rate),
          markup_rate: Number(rateData.markup_rate), effective_rate: effectiveRate, fee_amount: fee,
          rate_expires_at: new Date(Date.now() + 60000).toISOString(),
          status: 'executed', journal_id: journalId, executed_at: new Date().toISOString()
        })
        .select().single();

      if (txError) {
        console.error('FX transaction recording error:', txError);
      }

      return new Response(
        JSON.stringify({
          success: true, transaction: fxTransaction,
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
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
