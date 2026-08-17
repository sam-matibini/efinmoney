import { useMemo, useState } from "react";
import { useCorridorReadiness } from "@/hooks/useCostAssurance";
import { useActivePaymentPartners } from "@/hooks/usePartnerNetwork";
import { supabase } from "@/integrations/supabase/client";
import { countryLabel } from "./CountryCombobox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Grid3x3, Loader2, Play } from "lucide-react";

/** Map payment_partners.code → test-integration provider key. */
const TEST_KEYS: Record<string, string> = {
  flutterwave: "flutterwave",
  flw: "flutterwave",
  fincra: "fincra",
  flovide: "flovide",
  paypal: "paypal",
  square: "square",
  nomba: "nomba",
  stripe: "stripe",
  circle: "circle",
  dodo: "dodo",
  paytota: "paytota",
  wise: "wise",
  plaid: "plaid",
  ghana: "ghana",
  swychr: "swychr",
  elicate: "elicate",
  adyen: "adyen",
  lenhub: "lenhub",
};

function testKeyFor(code: string): string | null {
  return TEST_KEYS[code.trim().toLowerCase()] ?? null;
}

/**
 * Corridor × country matrix with live status and a connection test per partner.
 * Inactive partners (Circle, Stripe, …) are hidden.
 */
export const PartnerFeaturesPanel = () => {
  const { data: readiness, isLoading } = useCorridorReadiness();
  const { data: activePartners } = useActivePaymentPartners();
  const activeIds = useMemo(() => new Set((activePartners ?? []).map((p) => p.id)), [activePartners]);
  const [search, setSearch] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (readiness ?? [])
      .filter((r) => activeIds.has(r.partner_id))
      .filter((r) =>
        !q
          ? true
          : [r.partner_name, r.partner_code, r.dest_country, r.dest_currency, r.source_currency, r.payment_method]
              .join(" ")
              .toLowerCase()
              .includes(q),
      )
      .sort((a, b) =>
        (a.dest_country || "").localeCompare(b.dest_country || "")
        || a.partner_name.localeCompare(b.partner_name)
        || a.source_currency.localeCompare(b.source_currency),
      );
  }, [readiness, activeIds, search]);

  const runTest = async (code: string, name: string) => {
    const key = testKeyFor(code);
    if (!key) {
      toast.message(`${name} has no connection probe yet`);
      return;
    }
    setTesting(key);
    try {
      const { data, error } = await supabase.functions.invoke("test-integration", {
        body: { provider: key },
      });
      if (error) throw error;
      const result = data as { ok?: boolean; message?: string };
      if (result.ok) toast.success(`${name}: ${result.message || "connected"}`);
      else toast.warning(`${name}: ${result.message || "not connected"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${name} test failed`);
    } finally {
      setTesting(null);
    }
  };

  const liveCount = rows.filter((r) => r.live_routing_enabled).length;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Grid3x3 className="h-5 w-5" /> Partner features
            </CardTitle>
            <CardDescription>
              Live corridors by country for active partners only. Run a connection test without leaving this table.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{rows.length} corridors</Badge>
            <Badge>{liveCount} live</Badge>
          </div>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search country, partner, currency…"
          className="max-w-sm"
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !rows.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No active-partner corridors to show.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Test</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const key = testKeyFor(r.partner_code);
                  const busy = testing === key;
                  return (
                    <TableRow key={r.corridor_id}>
                      <TableCell>{r.dest_country ? countryLabel(r.dest_country) : "—"}</TableCell>
                      <TableCell className="font-medium">{r.partner_name}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.source_currency}→{r.dest_currency}
                      </TableCell>
                      <TableCell className="capitalize">
                        {(r.payment_method || "—").replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.live_routing_enabled ? (
                            <Badge>Live</Badge>
                          ) : (
                            <Badge variant="outline">Off</Badge>
                          )}
                          {r.ready ? (
                            <Badge variant="secondary">Ready</Badge>
                          ) : (
                            <Badge variant="outline">Not ready</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!key || busy}
                          onClick={() => void runTest(r.partner_code, r.partner_name)}
                        >
                          {busy ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-3.5 w-3.5" />
                          )}
                          Test
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PartnerFeaturesPanel;
