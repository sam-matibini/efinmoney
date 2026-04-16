import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ArrowUpDown,
  Bitcoin,
  DollarSign,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CryptoPair {
  id: string;
  base_currency: string;
  quote_currency: string;
  trading_fee_percent: number;
  min_trade_amount: number;
  max_trade_amount: number | null;
  is_active: boolean;
  current_price: number | null;
  price_available: boolean;
}

interface Quote {
  pair_id: string;
  side: 'buy' | 'sell';
  base_currency: string;
  quote_currency: string;
  base_amount: number;
  quote_amount: number;
  price: number;
  fee_amount: number;
  fee_currency: string;
  fee_percent: number;
  expires_in_seconds: number;
}

export const CryptoTradingPanel = () => {
  const [selectedPairId, setSelectedPairId] = useState<string>("");
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState("");
  const [amountType, setAmountType] = useState<'base' | 'quote'>('quote');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteExpiry, setQuoteExpiry] = useState(0);
  const [success, setSuccess] = useState(false);
  const queryClient = useQueryClient();

  // Fetch available pairs with live prices
  const { data: pairs, isLoading: pairsLoading, refetch: refetchPairs } = useQuery({
    queryKey: ['crypto-pairs'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('crypto-trading', {
        body: { action: 'pairs' },
      });

      if (response.error) {
        const msg = (response.data as any)?.error || response.error.message || 'Failed to load pairs';
        throw new Error(msg);
      }
      if ((response.data as any)?.error) {
        throw new Error((response.data as any).error);
      }
      return response.data.pairs as CryptoPair[];
    },
    refetchInterval: 30000, // Refresh prices every 30 seconds
  });

  const selectedPair = pairs?.find(p => p.id === selectedPairId);

  // Get quote mutation
  const getQuoteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPairId || !amount) throw new Error('Missing required fields');
      
      const response = await supabase.functions.invoke('crypto-trading', {
        body: {
          action: 'quote',
          pair_id: selectedPairId,
          side,
          amount: parseFloat(amount),
          amount_type: amountType,
        },
      });

      if (response.error) {
        const msg = (response.data as any)?.error || response.error.message || 'Failed to get quote';
        throw new Error(msg);
      }
      if ((response.data as any)?.error) {
        throw new Error((response.data as any).error);
      }
      return response.data as Quote;
    },
    onSuccess: (data) => {
      setQuote(data);
      setQuoteExpiry(data.expires_in_seconds);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Execute trade mutation
  const executeTradeMutation = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error('No active quote');
      
      const response = await supabase.functions.invoke('crypto-trading', {
        body: {
          action: 'execute',
          pair_id: quote.pair_id,
          side: quote.side,
          amount: amountType === 'base' ? quote.base_amount : quote.quote_amount,
          amount_type: amountType,
        },
      });

      if (response.error) {
        const msg = (response.data as any)?.error || response.error.message || 'Trade failed';
        throw new Error(msg);
      }
      if ((response.data as any)?.error) {
        throw new Error((response.data as any).error);
      }
      return response.data;
    },
    onSuccess: (data) => {
      setSuccess(true);
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['crypto-trades'] });
      
      setTimeout(() => {
        setSuccess(false);
        setQuote(null);
        setAmount("");
      }, 3000);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Quote expiry countdown
  useEffect(() => {
    if (quoteExpiry <= 0) return;
    
    const timer = setInterval(() => {
      setQuoteExpiry(prev => {
        if (prev <= 1) {
          setQuote(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [quoteExpiry]);

  // Auto-select first pair
  useEffect(() => {
    if (pairs?.length && !selectedPairId) {
      setSelectedPairId(pairs[0].id);
    }
  }, [pairs, selectedPairId]);

  const handleSwapSide = () => {
    setSide(prev => prev === 'buy' ? 'sell' : 'buy');
    setQuote(null);
  };

  const formatPrice = (price: number | null) => {
    if (!price) return '-';
    return price >= 1 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) 
                      : price.toFixed(6);
  };

  const getCurrencyIcon = (code: string) => {
    if (code === 'BTC') return <Bitcoin className="w-4 h-4" />;
    return <DollarSign className="w-4 h-4" />;
  };

  if (success) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center"
          >
            <CheckCircle className="w-10 h-10 text-green-500" />
          </motion.div>
          <h3 className="text-2xl font-display font-bold mb-2">Trade Complete!</h3>
          <p className="text-muted-foreground">
            {quote && (
              side === 'buy' 
                ? `Bought ${quote.base_amount.toFixed(6)} ${quote.base_currency}`
                : `Sold ${quote.base_amount.toFixed(6)} ${quote.base_currency}`
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live Prices */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4" />
              Live Crypto Prices
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => refetchPairs()}
              disabled={pairsLoading}
            >
              <RefreshCw className={`w-4 h-4 ${pairsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pairsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pairs?.map((pair) => (
                <button
                  key={pair.id}
                  onClick={() => setSelectedPairId(pair.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedPairId === pair.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getCurrencyIcon(pair.base_currency)}
                      <span className="font-medium">{pair.base_currency}/{pair.quote_currency}</span>
                    </div>
                    {!pair.price_available && (
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="mt-1 text-lg font-bold">
                    ${formatPrice(pair.current_price)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Fee: {pair.trading_fee_percent * 100}%
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trading Form */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Crypto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Buy/Sell Toggle */}
          <div className="flex gap-2">
            <Button
              variant={side === 'buy' ? 'default' : 'outline'}
              className={`flex-1 ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : ''}`}
              onClick={() => { setSide('buy'); setQuote(null); }}
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Buy
            </Button>
            <Button
              variant={side === 'sell' ? 'default' : 'outline'}
              className={`flex-1 ${side === 'sell' ? 'bg-red-600 hover:bg-red-700' : ''}`}
              onClick={() => { setSide('sell'); setQuote(null); }}
            >
              <TrendingDown className="w-4 h-4 mr-2" />
              Sell
            </Button>
          </div>

          {/* Trading Pair */}
          <div className="space-y-2">
            <Label>Trading Pair</Label>
            <Select value={selectedPairId} onValueChange={(v) => { setSelectedPairId(v); setQuote(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select pair" />
              </SelectTrigger>
              <SelectContent>
                {pairs?.filter(p => p.price_available).map((pair) => (
                  <SelectItem key={pair.id} value={pair.id}>
                    {pair.base_currency}/{pair.quote_currency} - ${formatPrice(pair.current_price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Amount</Label>
              <div className="flex gap-1">
                <Button 
                  variant={amountType === 'quote' ? 'secondary' : 'ghost'} 
                  size="sm"
                  onClick={() => { setAmountType('quote'); setQuote(null); }}
                >
                  {selectedPair?.quote_currency || 'USD'}
                </Button>
                <Button 
                  variant={amountType === 'base' ? 'secondary' : 'ghost'} 
                  size="sm"
                  onClick={() => { setAmountType('base'); setQuote(null); }}
                >
                  {selectedPair?.base_currency || 'BTC'}
                </Button>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                {amountType === 'quote' ? '$' : '₿'}
              </span>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                className="pl-10 text-xl h-12"
                step={amountType === 'base' ? '0.00000001' : '0.01'}
              />
            </div>
            {selectedPair && (
              <p className="text-xs text-muted-foreground">
                Min: {selectedPair.min_trade_amount} {selectedPair.base_currency}
                {selectedPair.max_trade_amount && ` • Max: ${selectedPair.max_trade_amount} ${selectedPair.base_currency}`}
              </p>
            )}
          </div>

          {/* Get Quote Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={() => getQuoteMutation.mutate()}
            disabled={!selectedPairId || !amount || parseFloat(amount) <= 0 || getQuoteMutation.isPending}
          >
            {getQuoteMutation.isPending ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              'Get Quote'
            )}
          </Button>

          {/* Quote Display */}
          <AnimatePresence>
            {quote && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-xl bg-muted space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Quote</span>
                  <Badge variant={quoteExpiry > 10 ? 'secondary' : 'destructive'}>
                    Expires in {quoteExpiry}s
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {side === 'buy' ? 'You Pay' : 'You Sell'}
                    </span>
                    <span className="font-mono font-medium">
                      {side === 'buy' 
                        ? `$${quote.quote_amount.toFixed(2)} ${quote.quote_currency}`
                        : `${quote.base_amount.toFixed(6)} ${quote.base_currency}`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {side === 'buy' ? 'You Receive' : 'You Get'}
                    </span>
                    <span className="font-mono font-medium text-primary">
                      {side === 'buy'
                        ? `${quote.base_amount.toFixed(6)} ${quote.base_currency}`
                        : `$${quote.quote_amount.toFixed(2)} ${quote.quote_currency}`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-mono">${formatPrice(quote.price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee ({quote.fee_percent}%)</span>
                    <span className="font-mono">${quote.fee_amount.toFixed(2)}</span>
                  </div>
                </div>

                <Button
                  className={`w-full ${side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                  size="lg"
                  onClick={() => executeTradeMutation.mutate()}
                  disabled={executeTradeMutation.isPending || quoteExpiry <= 0}
                >
                  {executeTradeMutation.isPending ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    `Confirm ${side === 'buy' ? 'Buy' : 'Sell'}`
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
};
