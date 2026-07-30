import { useState } from "react";
import { useRouteQuote, type RouteQuote } from "@/hooks/useRoutingEngine";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const RouteSimulatorPanel = () => {
  const quote = useRouteQuote();
  const [result, setResult] = useState<RouteQuote | null>(null);
  const [form, setForm] = useState({
    source_currency: "CAD",
    dest_currency: "NGN",
    dest_country: "NG",
    payment_method: "",
    amount: "500",
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Route simulator</CardTitle>
          <CardDescription>Score every eligible partner for a hypothetical transfer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            {([
              ["source_currency", "From currency"],
              ["dest_currency", "To currency"],
              ["dest_country", "Country"],
              ["payment_method", "Method (optional)"],
              ["amount", "Amount"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  value={(form as never as Record<string, string>)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <Button
            disabled={quote.isPending}
            onClick={() =>
              quote.mutate(
                {
                  source_currency: form.source_currency.toUpperCase(),
                  dest_currency: form.dest_currency.toUpperCase(),
                  dest_country: form.dest_country ? form.dest_country.toUpperCase() : null,
                  payment_method: form.payment_method || null,
                  amount: Number(form.amount) || 0,
                },
                { onSuccess: setResult },
              )
            }
          >
            {quote.isPending ? "Scoring…" : "Run simulation"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Candidates
              <Badge variant={result.kill_switch ? "destructive" : "secondary"}>
                {result.kill_switch ? "kill switch on" : result.mode}
              </Badge>
              {result.live_corridor && <Badge>live corridor</Badge>}
            </CardTitle>
            <CardDescription>
              Rule: {result.rule?.name ?? "default weights"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.candidates.map((c, i) => (
              <div
                key={c.partner_id}
                className={`rounded-lg border p-3 ${i === 0 ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {i + 1}. {c.partner_name}
                    {i === 0 && <Badge className="ml-2">recommended</Badge>}
                    {c.pricing_missing && (
                      <Badge variant="destructive" className="ml-2">pricing missing</Badge>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">score {c.score.toFixed(3)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground md:grid-cols-5">
                  <span>Cost {money(c.total_cost)}</span>
                  <span>Revenue {money(c.customer_revenue)}</span>
                  <span>Profit {money(c.expected_profit)}</span>
                  <span>Margin {c.margin_percent.toFixed(2)}%</span>
                  <span>
                    {c.est_minutes ?? "?"} min · {((c.success_rate ?? 0) * 100).toFixed(1)}% success
                  </span>
                </div>
              </div>
            ))}
            {!result.candidates.length && (
              <p className="text-sm text-muted-foreground">No eligible partner for this corridor.</p>
            )}
            {!!result.excluded?.length && (
              <div className="pt-2 text-xs text-muted-foreground">
                Excluded: {result.excluded.map((e) => `${e.partner_code} (${e.reason})`).join(", ")}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RouteSimulatorPanel;
