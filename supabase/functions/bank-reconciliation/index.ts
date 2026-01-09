import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReconciliationRequest {
  bank_account_id: string;
  date_from?: string;
  date_to?: string;
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

    // Use service role for bank reconciliation (admin function)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the user has finance or admin role
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

    // Check role
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
      const body: ReconciliationRequest = await req.json();
      const { bank_account_id, date_from, date_to } = body;

      // Get unmatched bank transactions
      let query = supabase
        .from('bank_transactions')
        .select('*')
        .eq('bank_account_id', bank_account_id);

      if (date_from) query = query.gte('transaction_date', date_from);
      if (date_to) query = query.lte('transaction_date', date_to);

      const { data: bankTxns, error: bankError } = await query;

      if (bankError) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch bank transactions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get already reconciled transaction IDs
      const { data: reconciledIds } = await supabase
        .from('reconciliation_records')
        .select('bank_transaction_id')
        .eq('status', 'matched');

      const reconciledSet = new Set(reconciledIds?.map(r => r.bank_transaction_id) || []);
      const unmatchedTxns = bankTxns?.filter(t => !reconciledSet.has(t.id)) || [];

      let matchedCount = 0;
      let unmatchedCount = 0;

      for (const bankTxn of unmatchedTxns) {
        // Try to match by reference (transfer ID in description)
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const match = bankTxn.description?.match(uuidPattern) || bankTxn.reference?.match(uuidPattern);

        if (match) {
          const potentialTransferId = match[0];
          
          // Check if this is a valid transfer
          const { data: transfer } = await supabase
            .from('transfers')
            .select('*')
            .eq('id', potentialTransferId)
            .single();

          if (transfer) {
            // Create reconciliation record
            await supabase
              .from('reconciliation_records')
              .insert({
                bank_transaction_id: bankTxn.id,
                transfer_id: transfer.id,
                matched_amount: bankTxn.credit_amount || bankTxn.debit_amount,
                status: 'matched',
                match_confidence: 95,
                match_reason: 'Reference ID match'
              });
            
            matchedCount++;
            continue;
          }
        }

        // Try fuzzy matching by amount and date
        const txnAmount = bankTxn.credit_amount || bankTxn.debit_amount;
        const txnDate = new Date(bankTxn.transaction_date);
        const dateTolerance = 2; // days

        const { data: potentialMatches } = await supabase
          .from('transfers')
          .select('*')
          .eq('source_amount', txnAmount)
          .gte('created_at', new Date(txnDate.getTime() - dateTolerance * 86400000).toISOString())
          .lte('created_at', new Date(txnDate.getTime() + dateTolerance * 86400000).toISOString())
          .eq('status', 'completed');

        if (potentialMatches && potentialMatches.length === 1) {
          // Single match - high confidence
          await supabase
            .from('reconciliation_records')
            .insert({
              bank_transaction_id: bankTxn.id,
              transfer_id: potentialMatches[0].id,
              matched_amount: txnAmount,
              status: 'matched',
              match_confidence: 80,
              match_reason: 'Amount and date match (single)'
            });
          
          matchedCount++;
        } else if (potentialMatches && potentialMatches.length > 1) {
          // Multiple potential matches - needs review
          await supabase
            .from('reconciliation_records')
            .insert({
              bank_transaction_id: bankTxn.id,
              matched_amount: txnAmount,
              status: 'exception',
              match_confidence: 50,
              exception_reason: `Multiple potential matches found (${potentialMatches.length})`
            });
          
          unmatchedCount++;
        } else {
          // No match found
          await supabase
            .from('reconciliation_records')
            .insert({
              bank_transaction_id: bankTxn.id,
              matched_amount: txnAmount,
              status: 'unmatched',
              match_confidence: 0,
              exception_reason: 'No matching transfer found'
            });
          
          unmatchedCount++;
        }
      }

      // Update last reconciled timestamp
      await supabase
        .from('bank_accounts')
        .update({ last_reconciled_at: new Date().toISOString() })
        .eq('id', bank_account_id);

      return new Response(
        JSON.stringify({
          success: true,
          matched: matchedCount,
          unmatched: unmatchedCount,
          total_processed: unmatchedTxns.length,
          message: `Reconciliation complete: ${matchedCount} matched, ${unmatchedCount} need review`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET RECONCILIATION STATUS
    if (req.method === 'GET' && action === 'status') {
      const bankAccountId = url.searchParams.get('bank_account_id');

      const { data: stats, error } = await supabase
        .from('reconciliation_records')
        .select('status')
        .eq('bank_transaction_id', bankAccountId ? bankAccountId : undefined);

      const summary = {
        matched: 0,
        unmatched: 0,
        exception: 0,
        pending: 0
      };

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
