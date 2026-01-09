import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting configuration
const RATE_LIMITS = {
  'dashboard': { requests: 30, window: 60 },     // 30 per minute
  'alerts': { requests: 30, window: 60 },        // 30 per minute
  'generate-sar': { requests: 5, window: 300 },  // 5 per 5 minutes
  'user-risk': { requests: 20, window: 60 }      // 20 per minute
};

// Validation helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ALERT_STATUSES = ['open', 'investigating', 'escalated', 'resolved', 'false_positive'] as const;
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function isValidUUID(str: unknown): str is string {
  return typeof str === 'string' && UUID_REGEX.test(str);
}

function isValidAlertStatus(str: unknown): str is typeof VALID_ALERT_STATUSES[number] {
  return typeof str === 'string' && VALID_ALERT_STATUSES.includes(str as typeof VALID_ALERT_STATUSES[number]);
}

function isValidSeverity(str: unknown): str is typeof VALID_SEVERITIES[number] {
  return typeof str === 'string' && VALID_SEVERITIES.includes(str as typeof VALID_SEVERITIES[number]);
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

interface AlertUpdateRequest {
  alert_id: string;
  status: typeof VALID_ALERT_STATUSES[number];
  notes?: string;
}

interface SarGenerateRequest {
  alert_ids: string[];
  jurisdiction?: string;
}

function validateAlertUpdateRequest(body: unknown): { valid: true; data: AlertUpdateRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const { alert_id, status, notes } = body as Record<string, unknown>;
  
  if (!isValidUUID(alert_id)) {
    return { valid: false, error: 'Invalid alert_id: must be a valid UUID' };
  }
  
  if (!isValidAlertStatus(status)) {
    return { valid: false, error: `Invalid status: must be one of ${VALID_ALERT_STATUSES.join(', ')}` };
  }
  
  if (notes !== undefined && typeof notes !== 'string') {
    return { valid: false, error: 'Invalid notes: must be a string' };
  }
  
  if (notes && notes.length > 5000) {
    return { valid: false, error: 'Notes too long: maximum 5000 characters' };
  }
  
  return { valid: true, data: { alert_id, status, notes: notes as string | undefined } };
}

function validateSarRequest(body: unknown): { valid: true; data: SarGenerateRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const { alert_ids, jurisdiction } = body as Record<string, unknown>;
  
  if (!Array.isArray(alert_ids)) {
    return { valid: false, error: 'Invalid alert_ids: must be an array' };
  }
  
  if (alert_ids.length === 0) {
    return { valid: false, error: 'alert_ids cannot be empty' };
  }
  
  if (alert_ids.length > 50) {
    return { valid: false, error: 'Too many alert_ids: maximum 50' };
  }
  
  for (const id of alert_ids) {
    if (!isValidUUID(id)) {
      return { valid: false, error: `Invalid alert_id in array: ${id}` };
    }
  }
  
  if (jurisdiction !== undefined && typeof jurisdiction !== 'string') {
    return { valid: false, error: 'Invalid jurisdiction: must be a string' };
  }
  
  if (jurisdiction && jurisdiction.length > 50) {
    return { valid: false, error: 'Jurisdiction too long: maximum 50 characters' };
  }
  
  return { valid: true, data: { alert_ids: alert_ids as string[], jurisdiction: jurisdiction as string | undefined } };
}

// Rate limiting helper
async function checkRateLimit(
  supabase: any,
  userId: string,
  action: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limit = RATE_LIMITS[action as keyof typeof RATE_LIMITS];
  if (!limit) return { allowed: true };
  
  const key = `compliance-monitoring:${action}:${userId}`;
  
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
      .in('role', ['admin', 'compliance']);

    if (!roleData || roleData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    // GET DASHBOARD
    if (req.method === 'GET' && action === 'dashboard') {
      const rateCheck = await checkRateLimit(supabase, userData.user.id, 'dashboard');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter || 60) } }
        );
      }

      const { data: alertCounts } = await supabase.from('compliance_alerts').select('severity, status').eq('status', 'open');

      const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      alertCounts?.forEach(a => {
        if (a.severity in severityCounts) {
          severityCounts[a.severity as keyof typeof severityCounts]++;
        }
      });

      const { data: recentAlerts } = await supabase
        .from('compliance_alerts')
        .select(`*, profiles:user_id(full_name, email), compliance_rules:rule_id(rule_name, rule_code)`)
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: dailyVolume } = await supabase
        .from('transfers')
        .select('created_at, source_amount')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

      const volumeByDay: Record<string, number> = {};
      dailyVolume?.forEach(t => {
        const day = new Date(t.created_at).toISOString().split('T')[0];
        volumeByDay[day] = (volumeByDay[day] || 0) + Number(t.source_amount);
      });

      return new Response(
        JSON.stringify({
          alert_summary: severityCounts, total_open_alerts: alertCounts?.length || 0,
          recent_alerts: recentAlerts, daily_volume: volumeByDay
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET ALERTS
    if (req.method === 'GET' && action === 'alerts') {
      const rateCheck = await checkRateLimit(supabase, userData.user.id, 'alerts');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter || 60) } }
        );
      }

      const status = url.searchParams.get('status');
      const severity = url.searchParams.get('severity');
      const limit = parseLimit(url.searchParams.get('limit'));

      if (status && !isValidAlertStatus(status)) {
        return new Response(
          JSON.stringify({ error: `Invalid status: must be one of ${VALID_ALERT_STATUSES.join(', ')}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (severity && !isValidSeverity(severity)) {
        return new Response(
          JSON.stringify({ error: `Invalid severity: must be one of ${VALID_SEVERITIES.join(', ')}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let query = supabase
        .from('compliance_alerts')
        .select(`*, profiles:user_id(full_name, email, kyc_status), compliance_rules:rule_id(rule_name, rule_code, rule_type), transfers:transfer_id(*)`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);
      if (severity) query = query.eq('severity', severity);

      const { data: alerts, error } = await query;

      if (error) {
        console.error('Failed to fetch alerts:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch alerts' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ alerts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // UPDATE ALERT STATUS
    if (req.method === 'PATCH' && action === 'alerts') {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const validation = validateAlertUpdateRequest(body);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { alert_id, status, notes } = validation.data;

      const updateData: Record<string, unknown> = { status };
      if (notes) updateData.notes = notes;
      
      if (status === 'resolved' || status === 'false_positive') {
        updateData.resolved_by = userData.user.id;
        updateData.resolved_at = new Date().toISOString();
      }

      const { data: updatedAlert, error } = await supabase.from('compliance_alerts').update(updateData).eq('id', alert_id).select().single();

      if (error) {
        console.error('Failed to update alert:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update alert' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, alert: updatedAlert }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GENERATE SAR
    if (req.method === 'POST' && action === 'generate-sar') {
      const rateCheck = await checkRateLimit(supabase, userData.user.id, 'generate-sar');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. You can generate at most 5 SAR reports every 5 minutes.' }),
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

      const validation = validateSarRequest(body);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { alert_ids, jurisdiction } = validation.data;

      const { data: alerts } = await supabase
        .from('compliance_alerts')
        .select(`*, profiles:user_id(*), compliance_rules:rule_id(*), transfers:transfer_id(*)`)
        .in('id', alert_ids);

      if (!alerts || alerts.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No alerts found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const reportData = {
        alerts: alerts.map(a => ({
          alert_id: a.id, rule_code: a.compliance_rules?.rule_code,
          rule_name: a.compliance_rules?.rule_name, severity: a.severity,
          user_name: a.profiles?.full_name, user_email: a.profiles?.email,
          transfer_amount: a.transfers?.source_amount, transfer_date: a.transfers?.created_at,
          alert_data: a.alert_data
        })),
        generated_at: new Date().toISOString(),
        generated_by: userData.user.email
      };

      const { data: report, error } = await supabase
        .from('compliance_reports')
        .insert({
          report_type: 'SAR',
          reporting_period_start: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
          reporting_period_end: new Date().toISOString().split('T')[0],
          jurisdiction: jurisdiction || 'USA',
          status: 'draft', report_data: reportData
        })
        .select().single();

      if (error) {
        console.error('Failed to generate report:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to generate report' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, report, message: `SAR report generated with ${alerts.length} alerts` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET USER RISK PROFILE
    if (req.method === 'GET' && action === 'user-risk') {
      const rateCheck = await checkRateLimit(supabase, userData.user.id, 'user-risk');
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter || 60) } }
        );
      }

      const userId = url.searchParams.get('user_id');

      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'user_id parameter is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!isValidUUID(userId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid user_id: must be a valid UUID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
      const { data: alertHistory } = await supabase.from('compliance_alerts').select('severity, status, created_at').eq('user_id', userId).order('created_at', { ascending: false });
      const { data: transfers } = await supabase.from('transfers').select('source_amount, target_currency, recipient_country, created_at').eq('sender_id', userId).order('created_at', { ascending: false }).limit(100);

      const totalAlerts = alertHistory?.length || 0;
      const criticalAlerts = alertHistory?.filter(a => a.severity === 'critical').length || 0;
      const avgTransferAmount = (transfers?.reduce((sum, t) => sum + Number(t.source_amount), 0) || 0) / (transfers?.length || 1);
      const uniqueCountries = new Set(transfers?.map(t => t.recipient_country)).size;

      const riskScore = Math.min(100, (
        (criticalAlerts * 25) + (totalAlerts * 5) +
        (avgTransferAmount > 5000 ? 20 : 0) + (uniqueCountries > 5 ? 10 : 0)
      ));

      return new Response(
        JSON.stringify({
          profile, risk_score: riskScore,
          risk_indicators: { total_alerts: totalAlerts, critical_alerts: criticalAlerts, avg_transfer_amount: avgTransferAmount, unique_countries: uniqueCountries },
          alert_history: alertHistory?.slice(0, 10), recent_transfers: transfers?.slice(0, 10)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Compliance monitoring error:', error);
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
