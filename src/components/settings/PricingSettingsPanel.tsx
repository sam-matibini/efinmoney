import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useUserRoles } from "@/hooks/useUserRoles";
import { 
  DollarSign, 
  Percent, 
  TrendingUp,
  Edit2,
  Save,
  X,
  Loader2
} from "lucide-react";

export const PricingSettingsPanel = () => {
  const queryClient = useQueryClient();
  const [editingPair, setEditingPair] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Persisted pricing settings (benchmarks + transfer fee structure)
  const { getNumber, isLoading: settingsLoading, saveSettings } = useSystemSettings();
  const { isAdmin } = useUserRoles();
  const [remitlyMargin, setRemitlyMargin] = useState("2.20");
  const [remitlyFlat, setRemitlyFlat] = useState("3.99");
  const [lemfiMargin, setLemfiMargin] = useState("1.80");
  const [lemfiFlat, setLemfiFlat] = useState("0.00");
  const [baseFee, setBaseFee] = useState("2.99");
  const [percentFee, setPercentFee] = useState("0.5");
  const [maxFee, setMaxFee] = useState("25.00");

  useEffect(() => {
    if (settingsLoading) return;
    setRemitlyMargin(String(getNumber("pricing.benchmark_remitly_margin_pct", 2.2)));
    setRemitlyFlat(String(getNumber("pricing.benchmark_remitly_flat_usd", 3.99)));
    setLemfiMargin(String(getNumber("pricing.benchmark_lemfi_margin_pct", 1.8)));
    setLemfiFlat(String(getNumber("pricing.benchmark_lemfi_flat_usd", 0)));
    setBaseFee(String(getNumber("pricing.transfer_base_fee", 2.99)));
    setPercentFee(String(getNumber("pricing.transfer_percent_fee", 0.5)));
    setMaxFee(String(getNumber("pricing.transfer_max_fee", 25)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading]);

  const savePricing = async (values: Record<string, unknown>, label: string) => {
    try {
      await saveSettings.mutateAsync(values);
      toast.success(`${label} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    }
  };


  // Fetch FX rates for markup configuration
  const { data: fxRates, isLoading: fxLoading } = useQuery({
    queryKey: ['fx-rates-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('*')
        .order('from_currency', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch crypto pairs
  const { data: cryptoPairs, isLoading: cryptoLoading } = useQuery({
    queryKey: ['crypto-pairs-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crypto_pairs')
        .select('*')
        .order('base_currency', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Update crypto pair mutation
  const updateCryptoPair = useMutation({
    mutationFn: async ({ id, trading_fee_percent, min_trade_amount, max_trade_amount, is_active }: {
      id: string;
      trading_fee_percent?: number;
      min_trade_amount?: number;
      max_trade_amount?: number | null;
      is_active?: boolean;
    }) => {
      const { error } = await supabase
        .from('crypto_pairs')
        .update({ trading_fee_percent, min_trade_amount, max_trade_amount, is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crypto-pairs-settings'] });
      toast.success("Crypto pair settings updated");
      setEditingPair(null);
    },
    onError: (error) => {
      toast.error("Failed to update settings: " + error.message);
    },
  });

  const handleEdit = (pairId: string, pair: any) => {
    setEditingPair(pairId);
    setEditValues({
      trading_fee_percent: pair.trading_fee_percent.toString(),
      min_trade_amount: pair.min_trade_amount.toString(),
      max_trade_amount: pair.max_trade_amount?.toString() || '',
    });
  };

  const handleSave = (pairId: string) => {
    updateCryptoPair.mutate({
      id: pairId,
      trading_fee_percent: parseFloat(editValues.trading_fee_percent),
      min_trade_amount: parseFloat(editValues.min_trade_amount),
      max_trade_amount: editValues.max_trade_amount ? parseFloat(editValues.max_trade_amount) : null,
    });
  };

  const handleToggleActive = (pairId: string, currentState: boolean) => {
    updateCryptoPair.mutate({
      id: pairId,
      is_active: !currentState,
    });
  };

  return (
    <div className="space-y-6">
      {/* Competitor Benchmark — internal only */}
      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-500" />
            Competitor Benchmark
            <Badge variant="outline" className="ml-2 text-[10px]">Internal — staff only</Badge>
          </CardTitle>
          <CardDescription>
            These values feed the "Typical market rate" comparison on the public calculator.
            Names are visible to staff only and never rendered on the landing page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Remitly — FX margin (%)</Label>
              <Input type="number" defaultValue="2.20" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>Remitly — Flat fee (USD)</Label>
              <Input type="number" defaultValue="3.99" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>LEMFI — FX margin (%)</Label>
              <Input type="number" defaultValue="1.80" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>LEMFI — Flat fee (USD)</Label>
              <Input type="number" defaultValue="0.00" step="0.01" />
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">Pricing target</div>
            <div className="text-muted-foreground">
              Intrinsically match <span className="font-semibold text-foreground">Remitly economy tier</span>.
              Current eFinMoney pricing: <span className="font-semibold text-foreground">0.80% FX + $0.99 flat</span>.
            </div>
          </div>
          <Button>
            <Save className="h-4 w-4 mr-2" />
            Save Benchmarks
          </Button>
        </CardContent>
      </Card>


      {/* Transfer Fees */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Transfer Fee Structure
          </CardTitle>
          <CardDescription>Configure fees for money transfers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="base_fee">Base Fee (USD)</Label>
              <Input id="base_fee" type="number" defaultValue="2.99" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="percent_fee">Percentage Fee (%)</Label>
              <Input id="percent_fee" type="number" defaultValue="0.5" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_fee">Maximum Fee (USD)</Label>
              <Input id="max_fee" type="number" defaultValue="25.00" step="0.01" />
            </div>
          </div>
          <Button className="mt-4">
            <Save className="h-4 w-4 mr-2" />
            Save Transfer Fees
          </Button>
        </CardContent>
      </Card>

      {/* FX Markup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            FX Markup Rates
          </CardTitle>
          <CardDescription>Current exchange rate markups applied</CardDescription>
        </CardHeader>
        <CardContent>
          {fxLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Currency Pair</TableHead>
                    <TableHead className="whitespace-nowrap">Market Rate</TableHead>
                    <TableHead className="whitespace-nowrap">Markup %</TableHead>
                    <TableHead className="whitespace-nowrap">Effective Rate</TableHead>
                    <TableHead className="whitespace-nowrap">Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fxRates?.slice(0, 10).map((rate) => (
                    <TableRow key={rate.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {rate.from_currency}/{rate.to_currency}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{rate.rate.toFixed(4)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline">{(rate.markup_rate * 100).toFixed(2)}%</Badge>
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{rate.effective_rate.toFixed(4)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {new Date(rate.valid_from).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Crypto Trading Fees */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Crypto Trading Fees
          </CardTitle>
          <CardDescription>Configure trading pairs and fee percentages</CardDescription>
        </CardHeader>
        <CardContent>
          {cryptoLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Trading Pair</TableHead>
                    <TableHead className="whitespace-nowrap">Trading Fee %</TableHead>
                    <TableHead className="whitespace-nowrap">Min Trade</TableHead>
                    <TableHead className="whitespace-nowrap">Max Trade</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cryptoPairs?.map((pair) => (
                    <TableRow key={pair.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {pair.base_currency}/{pair.quote_currency}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {editingPair === pair.id ? (
                          <Input
                            type="number"
                            value={editValues.trading_fee_percent}
                            onChange={(e) => setEditValues({ ...editValues, trading_fee_percent: e.target.value })}
                            className="w-20"
                            step="0.01"
                          />
                        ) : (
                          <Badge variant="outline">{pair.trading_fee_percent}%</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {editingPair === pair.id ? (
                          <Input
                            type="number"
                            value={editValues.min_trade_amount}
                            onChange={(e) => setEditValues({ ...editValues, min_trade_amount: e.target.value })}
                            className="w-20"
                          />
                        ) : (
                          pair.min_trade_amount
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {editingPair === pair.id ? (
                          <Input
                            type="number"
                            value={editValues.max_trade_amount}
                            onChange={(e) => setEditValues({ ...editValues, max_trade_amount: e.target.value })}
                            className="w-20"
                            placeholder="No limit"
                          />
                        ) : (
                          pair.max_trade_amount || 'No limit'
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Switch
                          checked={pair.is_active}
                          onCheckedChange={() => handleToggleActive(pair.id, pair.is_active)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {editingPair === pair.id ? (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSave(pair.id)}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingPair(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(pair.id, pair)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
