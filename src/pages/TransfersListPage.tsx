import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTransfers } from "@/hooks/useTransfers";
import { ChevronRight, Inbox, Search } from "lucide-react";
import { format } from "date-fns";

const refOf = (id: string) => `EFM-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const statusBadge = (s: string) => {
  if (s === "completed") return "bg-green-500/20 text-green-500 border-green-500/40";
  if (["failed", "reversed", "expired"].includes(s)) return "bg-destructive/20 text-destructive border-destructive/40";
  if (["processing", "funded"].includes(s)) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/40";
  return "bg-blue-500/20 text-blue-500 border-blue-500/40";
};

const groupFor = (s: string) => {
  if (s === "completed") return "completed";
  if (["failed", "reversed", "expired"].includes(s)) return "failed";
  return "processing";
};

const TransfersListPage = () => {
  const { data: transfers, isLoading } = useTransfers(200);
  const [filter, setFilter] = useState<"all" | "processing" | "completed" | "failed">("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    let items = transfers ?? [];
    if (filter !== "all") items = items.filter(t => groupFor(t.status) === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(t => t.recipient_name.toLowerCase().includes(q) || refOf(t.id).toLowerCase().includes(q));
    }
    if (from) items = items.filter(t => new Date(t.created_at) >= new Date(from));
    if (to) items = items.filter(t => new Date(t.created_at) <= new Date(to + "T23:59:59"));
    return items;
  }, [transfers, filter, search, from, to]);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold">All Transfers</h1>
          <p className="text-sm text-muted-foreground">Track and review every transfer you've sent.</p>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="processing">Processing</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="failed">Failed</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search recipient or reference" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No transfers match your filters.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((t, i) => (
                  <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                    <Link to={`/transfers/${t.id}`} className="flex items-center justify-between py-4 hover:bg-muted/40 px-2 rounded-lg transition-colors">
                      <div>
                        <p className="font-medium text-foreground">{t.recipient_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {refOf(t.id)} · {format(new Date(t.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-display font-semibold">
                            {Number(t.source_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} {t.source_currency}
                          </p>
                          <Badge variant="outline" className={`text-[10px] ${statusBadge(t.status)}`}>{t.status}</Badge>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <MobileNav />
    </div>
  );
};

export default TransfersListPage;
