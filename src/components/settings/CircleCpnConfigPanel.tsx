import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

interface Corridor {
  id: string;
  source_currency: string;
  dest_country: string;
  dest_currency: string;
  payout_method: string;
  enabled: boolean;
  min_amount: number;
  max_amount: number;
  est_minutes: number;
  markup_bps: number;
}

export function CircleCpnConfigPanel() {
  const qc = useQueryClient();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const { data: corridors = [], isLoading } = useQuery({
    queryKey: ["cpn_corridors_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpn_corridors")
        .select("*")
        .order("dest_country");
      if (error) throw error;
      return (data ?? []) as Corridor[];
    },
  });

  const updateCorridor = useMutation({
    mutationFn: async (payload: Partial<Corridor> & { id: string }) => {
      const { error } = await supabase.from("cpn_corridors").update(payload).eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cpn_corridors_admin"] });
      toast.success("Corridor updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("circle-quote", {
        body: {
          source_currency: "USD",
          dest_country: "MX",
          dest_currency: "MXN",
          source_amount: 100,
          payout_method: "bank",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTestResult(`OK — sample rate USD→MXN ≈ ${data.effective_rate?.toFixed(4)}`);
    } catch (e: any) {
      setTestResult(`ERROR — ${e?.message ?? e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" /> Circle Payments Network (CPN)
              </CardTitle>
              <CardDescription>
                USDC-settled cross-border bank payouts. Funds debit user wallet → USDC sent from
                Stellar treasury to Circle → Circle pays out local fiat to recipient bank.
              </CardDescription>
            </div>
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Keys configured
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={runTest} disabled={testing} variant="outline" size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${testing ? "animate-spin" : ""}`} />
              Test connection (USD→MXN $100 quote)
            </Button>
            {testResult && (
              <span className={`text-sm ${testResult.startsWith("OK") ? "text-green-600" : "text-destructive"}`}>
                {testResult.startsWith("OK") ? <CheckCircle2 className="h-4 w-4 inline mr-1" /> : <AlertCircle className="h-4 w-4 inline mr-1" />}
                {testResult}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Webhook URL: <code className="px-1 py-0.5 bg-muted rounded">{`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/circle-webhook`}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout Corridors</CardTitle>
          <CardDescription>
            Enable corridors one by one. Toggle on only after end-to-end testing with a small amount.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading corridors…</p>
          ) : (
            <div className="space-y-3">
              {corridors.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {c.source_currency} → {c.dest_currency} ({c.dest_country})
                      </span>
                      <Badge variant="outline" className="text-xs">{c.payout_method}</Badge>
                      {c.enabled && (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">Live</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      ETA ~{c.est_minutes} min · markup {c.markup_bps} bps · limits {c.min_amount}–{c.max_amount} {c.source_currency}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      defaultValue={c.markup_bps}
                      className="w-20 h-9"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== c.markup_bps && v >= 0 && v <= 1000) {
                          updateCorridor.mutate({ id: c.id, markup_bps: v });
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground">bps</span>
                    <Switch
                      checked={c.enabled}
                      disabled={updateCorridor.isPending}
                      onCheckedChange={(v) => updateCorridor.mutate({ id: c.id, enabled: v })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
