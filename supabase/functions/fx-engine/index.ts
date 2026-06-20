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

  if (from_wallet_id === to_wallet_id) {
    return { valid: false, error: 'Source and destination wallet must differ' };
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

  return {
    valid: true,
    data: {
      from_wallet_id,
      to_wallet_id,
      from_currency,
      to_currency,
      from_amount: from_amount as number,
    },
  };
}

type ResolvedRate = {
  effective_rate: number;
  market_rate: number;
  markup_rate: number;
  fee_rate: number;
};

async function resolveFxRate(
  supabase: ReturnType<typeof createClient>,
  from_currency: string,
  to_currency: string,
): Promise<ResolvedRate | null> {
  if (from_currency === to_currency) {
    return { effective_rate: 1, market_rate: 1, markup_rate: 0, fee_rate: 0 };
  }

  const { data: rateData } = await supabase
    .from('fx_rates')
    .select('*')
    .eq('from_currency', from_currency)
    .eq('to_currency', to_currency)
    .is('valid_until', null)
    .maybeSingle();

  if (rateData) {
    return {
      effective_rate: Number(rateData.effective_rate),
      market_rate: Number(rateData.rate),
      markup_rate: Number(rateData.markup_rate),
      fee_rate: 0.005,
    };
  }

  const { data: reverseRate } = await supabase
    .from('fx_rates')
    .select('*')
    .eq('from_currency', to_currency)
    .eq('to_currency', from_currency)
    .is('valid_until', null)
    .maybeSingle();

  if (!reverseRate) return null;

  const effective = Number(reverseRate.effective_rate);
  if (!effective) return null;

  return {
    effective_rate: 1 / effective,
    market_rate: 1 / Number(reverseRate.rate),
    markup_rate: Number(reverseRate.markup_rate),
    fee_rate: 0.005,
  };
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
    
    // Parse body first to check for action
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Get action from body or URL path
    const url = new URL(req.url);
    const pathAction = url.pathname.split('/').pop();
    const action = (body.action as string) || pathAction;

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

      const validation = validateQuoteRequest(body);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { from_currency, to_currency, amount } = validation.data;

      const resolved = await resolveFxRate(supabase, from_currency, to_currency);
      if (!resolved) {
        return new Response(
          JSON.stringify({ error: 'Exchange rate not available for this pair' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const fee = amount * resolved.fee_rate;
      const toAmount = (amount - fee) * resolved.effective_rate;

      return new Response(
        JSON.stringify({
          from_currency, to_currency, from_amount: amount, to_amount: toAmount,
          market_rate: resolved.market_rate,
          markup_rate: resolved.markup_rate,
          effective_rate: resolved.effective_rate, fee_amount: fee,
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

      if (fromWallet.status !== 'active') {
        return new Response(
          JSON.stringify({ error: `Source wallet is ${fromWallet.status}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (toWallet.status !== 'active') {
        return new Response(
          JSON.stringify({ error: `Destination wallet is ${toWallet.status}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (fromWallet.currency_code !== from_currency || toWallet.currency_code !== to_currency) {
        return new Response(
          JSON.stringify({ error: 'Wallet currencies do not match request' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: walletBalances } = await supabase.rpc('get_user_wallet_balances', { p_user_id: userId });
      const fromBalanceRow = (walletBalances ?? []).find((w: { wallet_id: string }) => w.wallet_id === from_wallet_id);
      const fromBalance = Number(fromBalanceRow?.balance ?? 0);
      if (from_amount > fromBalance) {
        return new Response(
          JSON.stringify({ error: 'Insufficient wallet balance' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const resolved = await resolveFxRate(supabase, from_currency, to_currency);
      if (!resolved) {
        return new Response(
          JSON.stringify({ error: 'Exchange rate not available for this pair' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const effectiveRate = resolved.effective_rate;
      const fee = from_amount * resolved.fee_rate;
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
        const msg = swapError.message?.includes('Insufficient')
          ? 'Insufficient wallet balance'
          : 'Failed to execute transfer. Please try again.';
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: fxTransaction, error: txError } = await supabase
        .from('fx_transactions')
        .insert({
          user_id: userId, from_wallet_id, to_wallet_id, from_currency, to_currency, from_amount,
          to_amount: toAmount, market_rate: resolved.market_rate,
          markup_rate: resolved.markup_rate, effective_rate: effectiveRate, fee_amount: fee,
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
