import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Coins, Bitcoin } from "lucide-react";
import { toast } from "sonner";
import { CurrencyFlag } from "@/components/ui/FlagImage";

interface Currency {
  code: string;
  name: string;
  symbol: string;
  flag_emoji: string | null;
  currency_type: 'fiat' | 'crypto';
  decimal_places: number;
  is_active: boolean;
}

export const CurrencyManagementPanel = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("fiat");
  const queryClient = useQueryClient();

  const { data: currencies, isLoading } = useQuery({
    queryKey: ['currencies-management'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('currencies')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Currency[];
    },
  });

  const toggleCurrencyMutation = useMutation({
    mutationFn: async ({ code, is_active }: { code: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('currencies')
        .update({ is_active })
        .eq('code', code);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currencies-management'] });
      queryClient.invalidateQueries({ queryKey: ['currencies'] });
      toast.success("Currency status updated");
    },
    onError: () => {
      toast.error("Failed to update currency status");
    },
  });

  const filteredCurrencies = currencies?.filter(currency => {
    const matchesSearch = 
      currency.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      currency.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = currency.currency_type === activeTab;
    return matchesSearch && matchesType;
  }) || [];

  const fiatCount = currencies?.filter(c => c.currency_type === 'fiat').length || 0;
  const cryptoCount = currencies?.filter(c => c.currency_type === 'crypto').length || 0;
  const activeFiatCount = currencies?.filter(c => c.currency_type === 'fiat' && c.is_active).length || 0;
  const activeCryptoCount = currencies?.filter(c => c.currency_type === 'crypto' && c.is_active).length || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" />
          Currency Management
        </CardTitle>
        <CardDescription>
          Configure which currencies are available for wallets, transfers, and trading
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search currencies by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fiat" className="gap-2">
              <Coins className="h-4 w-4" />
              Fiat ({activeFiatCount}/{fiatCount})
            </TabsTrigger>
            <TabsTrigger value="crypto" className="gap-2">
              <Bitcoin className="h-4 w-4" />
              Crypto ({activeCryptoCount}/{cryptoCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fiat" className="mt-4">
            <CurrencyList 
              currencies={filteredCurrencies} 
              isLoading={isLoading}
              onToggle={(code, is_active) => toggleCurrencyMutation.mutate({ code, is_active })}
              isPending={toggleCurrencyMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="crypto" className="mt-4">
            <CurrencyList 
              currencies={filteredCurrencies} 
              isLoading={isLoading}
              onToggle={(code, is_active) => toggleCurrencyMutation.mutate({ code, is_active })}
              isPending={toggleCurrencyMutation.isPending}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

interface CurrencyListProps {
  currencies: Currency[];
  isLoading: boolean;
  onToggle: (code: string, is_active: boolean) => void;
  isPending: boolean;
}

const CurrencyList = ({ currencies, isLoading, onToggle, isPending }: CurrencyListProps) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array(8).fill(0).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (currencies.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No currencies found matching your search.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-2">
        {currencies.map((currency) => (
          <div
            key={currency.code}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <CurrencyFlag code={currency.code} size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{currency.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {currency.code}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Symbol: {currency.symbol} • {currency.decimal_places} decimals
                </div>
              </div>
            </div>
            <Switch
              checked={currency.is_active}
              onCheckedChange={(checked) => onToggle(currency.code, checked)}
              disabled={isPending}
            />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
