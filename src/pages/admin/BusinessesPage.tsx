import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Search, Eye, Building, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// business_profiles / business_owners aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

interface BusinessRow {
  id: string;
  owner_user_id: string;
  legal_name: string;
  operating_name: string | null;
  entity_type: string | null;
  registration_number: string | null;
  incorporation_country: string | null;
  business_email: string | null;
  business_phone: string | null;
  kyb_status: string;
  kyb_tier: string;
  risk_level: string;
  submitted_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground border-muted",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  pending_review: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  approved: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  rejected: "bg-red-500/10 text-red-500 border-red-500/20",
  suspended: "bg-red-500/10 text-red-500 border-red-500/20",
};

const RISK_STYLES: Record<string, string> = {
  low: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  high: "bg-red-500/10 text-red-500 border-red-500/20",
};

const BusinessesPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ["admin-businesses-list"],
    queryFn: async () => {
      const { data, error } = await db
        .from("business_profiles")
        .select(
          "id, owner_user_id, legal_name, operating_name, entity_type, registration_number, incorporation_country, business_email, business_phone, kyb_status, kyb_tier, risk_level, submitted_at, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as BusinessRow[];
    },
  });

  const filtered = businesses.filter((b) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      b.legal_name?.toLowerCase().includes(q) ||
      b.operating_name?.toLowerCase().includes(q) ||
      b.registration_number?.toLowerCase().includes(q) ||
      b.business_email?.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: businesses.length,
    approved: businesses.filter((b) => b.kyb_status === "approved").length,
    pending: businesses.filter((b) => b.kyb_status === "pending_review" || b.kyb_status === "in_progress").length,
    blocked: businesses.filter((b) => b.kyb_status === "rejected" || b.kyb_status === "suspended").length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="w-7 h-7 text-primary" /> Businesses
            </h1>
            <p className="text-sm text-muted-foreground">Manage all business (SME) accounts</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, icon: Building, color: "text-primary", bg: "bg-primary/10" },
            { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-indigo-500", bg: "bg-indigo-500/10" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
            { label: "Blocked", value: stats.blocked, icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.bg} ${s.color}`}>
                  <s.icon className="w-6 h-6" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{s.label}</div>
                  <div className="text-3xl font-display font-bold text-foreground tabular-nums">{s.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">All businesses ({filtered.length})</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search legal name, DBA, reg #, or email"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Reg. #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                          {query ? "No businesses match your search" : "No businesses yet"}
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((b) => (
                      <TableRow key={b.id} className="cursor-pointer" onClick={() => navigate(`/admin/businesses/${b.id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{b.legal_name}</div>
                              {b.operating_name && (
                                <div className="text-xs text-muted-foreground truncate">{b.operating_name}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize text-sm">{b.entity_type?.replace(/_/g, " ") || "—"}</TableCell>
                        <TableCell className="text-sm">{b.incorporation_country || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{b.registration_number || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLES[b.kyb_status] || "bg-muted text-muted-foreground"}>
                            {b.kyb_status?.replace(/_/g, " ") || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge variant="outline">{b.kyb_tier}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={RISK_STYLES[b.risk_level] || "bg-muted text-muted-foreground"}>
                            {b.risk_level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {b.submitted_at ? format(new Date(b.submitted_at), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/admin/businesses/${b.id}`)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
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
    </AdminLayout>
  );
};

export default BusinessesPage;
