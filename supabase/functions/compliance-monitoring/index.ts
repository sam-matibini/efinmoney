import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    
    // Verify user has compliance role
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

    // GET DASHBOARD - Compliance overview
    if (req.method === 'GET' && action === 'dashboard') {
      // Get alert counts by severity
      const { data: alertCounts } = await supabase
        .from('compliance_alerts')
        .select('severity, status')
        .eq('status', 'open');

      const severityCounts = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      };

      alertCounts?.forEach(a => {
        if (a.severity in severityCounts) {
          severityCounts[a.severity as keyof typeof severityCounts]++;
        }
      });

      // Get recent alerts
      const { data: recentAlerts } = await supabase
        .from('compliance_alerts')
        .select(`
          *,
          profiles:user_id(full_name, email),
          compliance_rules:rule_id(rule_name, rule_code)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      // Get daily transaction volume for suspicious patterns
      const { data: dailyVolume } = await supabase
        .from('transfers')
        .select('created_at, source_amount')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

      // Aggregate by day
      const volumeByDay: Record<string, number> = {};
      dailyVolume?.forEach(t => {
        const day = new Date(t.created_at).toISOString().split('T')[0];
        volumeByDay[day] = (volumeByDay[day] || 0) + Number(t.source_amount);
      });

      return new Response(
        JSON.stringify({
          alert_summary: severityCounts,
          total_open_alerts: alertCounts?.length || 0,
          recent_alerts: recentAlerts,
          daily_volume: volumeByDay
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET ALERTS - List with filters
    if (req.method === 'GET' && action === 'alerts') {
      const status = url.searchParams.get('status');
      const severity = url.searchParams.get('severity');
      const limit = parseInt(url.searchParams.get('limit') || '50');

      let query = supabase
        .from('compliance_alerts')
        .select(`
          *,
          profiles:user_id(full_name, email, kyc_status),
          compliance_rules:rule_id(rule_name, rule_code, rule_type),
          transfers:transfer_id(*)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);
      if (severity) query = query.eq('severity', severity);

      const { data: alerts, error } = await query;

      if (error) {
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
      const body = await req.json();
      const { alert_id, status, notes } = body;

      const updateData: Record<string, unknown> = { status };
      if (notes) updateData.notes = notes;
      
      if (status === 'resolved' || status === 'false_positive') {
        updateData.resolved_by = userData.user.id;
        updateData.resolved_at = new Date().toISOString();
      }

      const { data: updatedAlert, error } = await supabase
        .from('compliance_alerts')
        .update(updateData)
        .eq('id', alert_id)
        .select()
        .single();

      if (error) {
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

    // GENERATE SAR (Suspicious Activity Report)
    if (req.method === 'POST' && action === 'generate-sar') {
      const body = await req.json();
      const { alert_ids, jurisdiction } = body;

      // Get alert details
      const { data: alerts } = await supabase
        .from('compliance_alerts')
        .select(`
          *,
          profiles:user_id(*),
          compliance_rules:rule_id(*),
          transfers:transfer_id(*)
        `)
        .in('id', alert_ids);

      if (!alerts || alerts.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No alerts found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create report
      const reportData = {
        alerts: alerts.map(a => ({
          alert_id: a.id,
          rule_code: a.compliance_rules?.rule_code,
          rule_name: a.compliance_rules?.rule_name,
          severity: a.severity,
          user_name: a.profiles?.full_name,
          user_email: a.profiles?.email,
          transfer_amount: a.transfers?.source_amount,
          transfer_date: a.transfers?.created_at,
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
          status: 'draft',
          report_data: reportData
        })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to generate report' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          report,
          message: `SAR report generated with ${alerts.length} alerts`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET USER RISK PROFILE
    if (req.method === 'GET' && action === 'user-risk') {
      const userId = url.searchParams.get('user_id');

      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'user_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Get alert history
      const { data: alertHistory } = await supabase
        .from('compliance_alerts')
        .select('severity, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Get transfer patterns
      const { data: transfers } = await supabase
        .from('transfers')
        .select('source_amount, target_currency, recipient_country, created_at')
        .eq('sender_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      // Calculate risk indicators
      const totalAlerts = alertHistory?.length || 0;
      const criticalAlerts = alertHistory?.filter(a => a.severity === 'critical').length || 0;
      const avgTransferAmount = (transfers?.reduce((sum, t) => sum + Number(t.source_amount), 0) || 0) / (transfers?.length || 1);
      const uniqueCountries = new Set(transfers?.map(t => t.recipient_country)).size;

      const riskScore = Math.min(100, (
        (criticalAlerts * 25) +
        (totalAlerts * 5) +
        (avgTransferAmount > 5000 ? 20 : 0) +
        (uniqueCountries > 5 ? 10 : 0)
      ));

      return new Response(
        JSON.stringify({
          profile,
          risk_score: riskScore,
          risk_indicators: {
            total_alerts: totalAlerts,
            critical_alerts: criticalAlerts,
            avg_transfer_amount: avgTransferAmount,
            unique_countries: uniqueCountries
          },
          alert_history: alertHistory?.slice(0, 10),
          recent_transfers: transfers?.slice(0, 10)
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
