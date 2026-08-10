import { useMemo, useState } from "react";
import { useTableQuery, type Col } from "./tableToolkit";
import { downloadXlsx } from "@/lib/tableExport";
import {
  usePaymentPartners,
  useSeedPartnerNetwork,
  type SeedResult,
  type SeedScope,
} from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rocket, Eye, AlertTriangle, FileSpreadsheet } from "lucide-react";

const SCOPES: { value: SeedScope; label: string; hint: string }[] = [
  { value: "pricing", label: "Partner pricing", hint: "Rate cards for every enabled corridor" },
  { value: "fx", label: "Partner FX", hint: "Mid-market quote + each partner's spread" },
  { value: "retail", label: "Customer pricing", hint: "eFinMoney consumer & business price book" },
];

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export const NetworkActivationPanel = () => {
  const { data: partners } = usePaymentPartners();
  const seed = useSeedPartnerNetwork();
  const [partnerId, setPartnerId] = useState("");
  const [scopes, setScopes] = useState<SeedScope[]>(["pricing", "fx", "retail"]);
  const [result, setResult] = useState<SeedResult | null>(null);

  const toggle = (s: SeedScope, on: boolean) =>
    setScopes((cur) => (on ? [...new Set([...cur, s])] : cur.filter((x) => x !== s)));

  const run = (apply: boolean) =>
    seed.mutate(
      { partnerId: partnerId || undefined, scopes, apply },
      { onSuccess: (res) => setResult(res) },
    );

  const preview = result?.preview;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" /> Network Activation
            </CardTitle>
            <CardDescription>
              Seed pricing, FX and the customer price book from published partner rate cards. Routes that already have a
              current version are never touched — preview first, then apply.
            </CardDescription>
          </div>
          <Select value={partnerId || "all"} onValueChange={(v) => setPartnerId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All partners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All partners</SelectItem>
              {partners?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-4">
          {SCOPES.map((s) => (
            <label key={s.value} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={scopes.includes(s.value)}
                onCheckedChange={(v) => toggle(s.value, v === true)}
                className="mt-0.5"
              />
              <span>
                <Label className="cursor-pointer">{s.label}</Label>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => run(false)} disabled={!scopes.length || seed.isPending}>
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>
          <Button
            size="sm"
            onClick={() => run(true)}
            disabled={!scopes.length || seed.isPending || !result || result.applied}
          >
            <Rocket className="h-4 w-4 mr-1" /> Apply {result ? `${result.summary.pricing + result.summary.fx + result.summary.retail} rows` : ""}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!result ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Run a preview to see exactly what would be written.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={result.applied ? "default" : "secondary"}>
                {result.applied ? "Applied" : "Preview"}
              </Badge>
              <Badge variant="outline">Pricing: {result.summary.pricing}</Badge>
              <Badge variant="outline">FX: {result.summary.fx}</Badge>
              <Badge variant="outline">Retail: {result.summary.retail}</Badge>
            </div>

            {result.summary.skipped?.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
                <div className="flex items-center gap-2 font-medium text-amber-500">
                  <AlertTriangle className="h-4 w-4" /> Skipped
                </div>
                {result.summary.skipped.map((s) => (
                  <div key={s} className="text-muted-foreground">{s}</div>
                ))}
              </div>
            )}

            {preview && (
              <Tabs defaultValue="pricing">
                <TabsList>
                  <TabsTrigger value="pricing">Pricing ({preview.pricing.length})</TabsTrigger>
                  <TabsTrigger value="fx">FX ({preview.fx.length})</TabsTrigger>
                  <TabsTrigger value="retail">Retail ({preview.retail.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="pricing">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Partner</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead className="text-right">Fixed</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead className="text-right">FX bps</TableHead>
                          <TableHead className="text-right">Other</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.pricing.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{String(r.partner_code)}</TableCell>
                            <TableCell>
                              {String(r.source_currency)}→{String(r.dest_currency)}
                              <div className="text-xs text-muted-foreground capitalize">
                                {String(r.payment_method).replace(/_/g, " ")}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{num(r.fixed_fee).toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums">{num(r.percentage_fee)}%</TableCell>
                            <TableCell className="text-right tabular-nums">{num(r.fx_markup_bps)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {(num(r.settlement_fee) + num(r.network_fee) + num(r.compliance_fee)).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="fx">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Partner</TableHead>
                          <TableHead>Pair</TableHead>
                          <TableHead className="text-right">Mid-market</TableHead>
                          <TableHead className="text-right">Partner rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.fx.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{String(r.partner_code)}</TableCell>
                            <TableCell>
                              {String(r.base_currency)}/{String(r.quote_currency)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{num(r.mid_market_rate).toFixed(4)}</TableCell>
                            <TableCell className="text-right tabular-nums">{num(r.partner_rate).toFixed(4)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="retail">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead className="text-right">Fixed</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead className="text-right">FX bps</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.retail.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="capitalize">{String(r.customer_type)}</TableCell>
                            <TableCell>
                              {String(r.source_currency)}→{String(r.dest_currency)}
                              <div className="text-xs text-muted-foreground capitalize">
                                {String(r.payment_method).replace(/_/g, " ")}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{num(r.fixed_fee).toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums">{num(r.percentage_fee)}%</TableCell>
                            <TableCell className="text-right tabular-nums">{num(r.fx_margin_bps)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default NetworkActivationPanel;
