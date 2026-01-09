import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting configuration - stricter for expensive operations
const RATE_LIMITS = {
  'auto-match': { requests: 2, window: 300 },    // 2 per 5 minutes
  'status': { requests: 30, window: 60 }         // 30 per minute
};

// Validation helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidUUID(str: unknown): str is string {
  return typeof str === 'string' && UUID_REGEX.test(str);
}

function isValidISODate(str: unknown): str is string {
  if (typeof str !== 'string' || !ISO_DATE_REGEX.test(str)) {
    return false;
  }
  const date = new Date(str);
  return !isNaN(date.getTime());
}

interface ReconciliationRequest {
  bank_account_id: string;
  date_from?: string;
  date_to?: string;
}

function validateReconciliationRequest(body: unknown): { valid: true; data: ReconciliationRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const { bank_account_id, date_from, date_to } = body as Record<string, unknown>;
  
  if (!isValidUUID(bank_account_id)) {
    return { valid: false, error: 'Invalid bank_account_id: must be a valid UUID' };
  }
  
  if (date_from !== undefined && !isValidISODate(date_from)) {
    return { valid: false, error: 'Invalid date_from: must be in YYYY-MM-DD format' };
  }
  
  if (date_to !== undefined && !isValidISODate(date_to)) {
    return { valid: false, error: 'Invalid date_to: must be in YYYY-MM-DD format' };
  }
  
  if (date_from && date_to) {
    const from = new Date(date_from);
    const to = new Date(date_to);
    if (from > to) {
      return { valid: false, error: 'date_from cannot be after date_to' };
    }
  }
  
  return { valid: true, data: { bank_account_id, date_from: date_from as string | undefined, date_to: date_to as string | undefined } };
}

// Rate limiting helper
async function checkRateLimit(
  supabase: any,
  userId: string,
  action: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limit = RATE_LIMITS[action as keyof typeof RATE_LIMITS];
  if (!limit) return { allowed: true };
  
  const key = `bank-reconciliation:${action}:${userId}`;
  
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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await userSupabase.auth.getUser(token);
    
    if (!userData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .in('role', ['admin', 'finance']);

    if (!roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    // RUN AUTO-RECONCILIATION
    if (req.method === 'POST' && action === 'auto-match') {
      // Check rate limit - very strict for this expensive operation
      const rateCheck = await checkRateLimit(supabase, userData.user.id, 'auto-match');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. You can run reconciliation at most twice every 5 minutes.' }),
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

      const validation = validateReconciliationRequest(body);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { bank_account_id, date_from, date_to } = validation.data;

      const { data: bankAccount, error: bankAccountError } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('id', bank_account_id)
        .single();

      if (bankAccountError || !bankAccount) {
        return new Response(
          JSON.stringify({ error: 'Bank account not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let query = supabase.from('bank_transactions').select('*').eq('bank_account_id', bank_account_id);
      if (date_from) query = query.gte('transaction_date', date_from);
      if (date_to) query = query.lte('transaction_date', date_to);

      const { data: bankTxns, error: bankError } = await query;

      if (bankError) {
        console.error('Failed to fetch bank transactions:', bankError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch bank transactions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: reconciledIds } = await supabase
        .from('reconciliation_records')
        .select('bank_transaction_id')
        .eq('status', 'matched');

      const reconciledSet = new Set(reconciledIds?.map(r => r.bank_transaction_id) || []);
      const unmatchedTxns = bankTxns?.filter(t => !reconciledSet.has(t.id)) || [];

      let matchedCount = 0;
      let unmatchedCount = 0;

      for (const bankTxn of unmatchedTxns) {
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const match = bankTxn.description?.match(uuidPattern) || bankTxn.reference?.match(uuidPattern);

        if (match) {
          const potentialTransferId = match[0];
          const { data: transfer } = await supabase.from('transfers').select('*').eq('id', potentialTransferId).single();

          if (transfer) {
            await supabase.from('reconciliation_records').insert({
              bank_transaction_id: bankTxn.id, transfer_id: transfer.id,
              matched_amount: bankTxn.credit_amount || bankTxn.debit_amount,
              status: 'matched', match_confidence: 95, match_reason: 'Reference ID match'
            });
            matchedCount++;
            continue;
          }
        }

        const txnAmount = bankTxn.credit_amount || bankTxn.debit_amount;
        const txnDate = new Date(bankTxn.transaction_date);
        const dateTolerance = 2;

        const { data: potentialMatches } = await supabase
          .from('transfers')
          .select('*')
          .eq('source_amount', txnAmount)
          .gte('created_at', new Date(txnDate.getTime() - dateTolerance * 86400000).toISOString())
          .lte('created_at', new Date(txnDate.getTime() + dateTolerance * 86400000).toISOString())
          .eq('status', 'completed');

        if (potentialMatches && potentialMatches.length === 1) {
          await supabase.from('reconciliation_records').insert({
            bank_transaction_id: bankTxn.id, transfer_id: potentialMatches[0].id,
            matched_amount: txnAmount, status: 'matched', match_confidence: 80,
            match_reason: 'Amount and date match (single)'
          });
          matchedCount++;
        } else if (potentialMatches && potentialMatches.length > 1) {
          await supabase.from('reconciliation_records').insert({
            bank_transaction_id: bankTxn.id, matched_amount: txnAmount, status: 'exception',
            match_confidence: 50, exception_reason: `Multiple potential matches found (${potentialMatches.length})`
          });
          unmatchedCount++;
        } else {
          await supabase.from('reconciliation_records').insert({
            bank_transaction_id: bankTxn.id, matched_amount: txnAmount, status: 'unmatched',
            match_confidence: 0, exception_reason: 'No matching transfer found'
          });
          unmatchedCount++;
        }
      }

      await supabase.from('bank_accounts').update({ last_reconciled_at: new Date().toISOString() }).eq('id', bank_account_id);

      return new Response(
        JSON.stringify({
          success: true, matched: matchedCount, unmatched: unmatchedCount,
          total_processed: unmatchedTxns.length,
          message: `Reconciliation complete: ${matchedCount} matched, ${unmatchedCount} need review`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET RECONCILIATION STATUS
    if (req.method === 'GET' && action === 'status') {
      // Check rate limit
      const rateCheck = await checkRateLimit(supabase, userData.user.id, 'status');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter || 60) } }
        );
      }

      const bankAccountId = url.searchParams.get('bank_account_id');

      if (bankAccountId && !isValidUUID(bankAccountId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid bank_account_id: must be a valid UUID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let query = supabase.from('reconciliation_records').select('status, bank_transaction_id');

      if (bankAccountId) {
        const { data: bankTxns } = await supabase.from('bank_transactions').select('id').eq('bank_account_id', bankAccountId);
        const txnIds = bankTxns?.map(t => t.id) || [];
        if (txnIds.length > 0) {
          query = query.in('bank_transaction_id', txnIds);
        } else {
          return new Response(
            JSON.stringify({ summary: { matched: 0, unmatched: 0, exception: 0, pending: 0 } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { data: stats, error } = await query;

      if (error) {
        console.error('Failed to fetch reconciliation status:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch reconciliation status' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const summary = { matched: 0, unmatched: 0, exception: 0, pending: 0 };
      stats?.forEach(s => {
        if (s.status in summary) {
          summary[s.status as keyof typeof summary]++;
        }
      });

      return new Response(
        JSON.stringify({ summary }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Reconciliation error:', error);
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
