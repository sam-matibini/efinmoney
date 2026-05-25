import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { KycStatusBadge } from "@/components/admin-portal/Badges";
import { KycRiskTagChip } from "@/components/admin/KycRiskTagChip";
import { extractRiskTags } from "@/lib/personaTags";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Search, Eye } from "lucide-react";

const PAGE_SIZE = 25;

const KycQueuePage = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("pending_review");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-kyc-queue", statusFilter, docTypeFilter, countryFilter, search, page],
    queryFn: async () => {
      let q = supabase
        .from("kyc_verifications")
        .select("id, user_id, verification_status, id_document_type, id_document_country, submitted_at, reviewed_by, created_at, persona_decision, persona_verification_data", { count: "exact" });

      if (statusFilter !== "all") q = q.eq("verification_status", statusFilter as "pending_review");
      if (docTypeFilter !== "all") q = q.eq("id_document_type", docTypeFilter as "passport");
      if (countryFilter !== "all") q = q.eq("id_document_country", countryFilter);

      // Sort: pending_review oldest first, others newest first
      const ascending = statusFilter === "pending_review";
      q = q.order(ascending ? "submitted_at" : "created_at", { ascending, nullsFirst: false });
      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data: rows, count } = await q;
      const userIds = Array.from(new Set((rows || []).map((r) => r.user_id)));
      const adminIds = Array.from(new Set((rows || []).map((r) => r.reviewed_by).filter(Boolean) as string[]));

      const [profilesRes, adminsRes] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("user_id, full_name, email, account_number").in("user_id", userIds) : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null; email: string | null; account_number: string | null }> }),
        adminIds.length ? supabase.from("admin_users").select("id, full_name").in("id", adminIds) : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      const adminMap = new Map((adminsRes.data || []).map((a) => [a.id, a]));

      let enriched = (rows || []).map((r) => ({
        ...r,
        profile: profileMap.get(r.user_id),
        reviewer: r.reviewed_by ? adminMap.get(r.reviewed_by) : null,
      }));

      if (search.trim()) {
        const s = search.toLowerCase();
        enriched = enriched.filter(
          (r) =>
            r.profile?.full_name?.toLowerCase().includes(s) ||
            r.profile?.email?.toLowerCase().includes(s) ||
            r.profile?.account_number?.toLowerCase().includes(s)
        );
      }

      return { rows: enriched, total: count || 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.rows || []).forEach((r) => { if (r.id_document_country) set.add(r.id_document_country); });
    return Array.from(set).sort();
  }, [data]);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-display text-2xl font-semibold">KYC Queue</h1>
            <p className="text-sm text-muted-foreground">Review user identity verifications</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search name, email, account #" className="pl-9" />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending_review">Pending review</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={docTypeFilter} onValueChange={(v) => { setDocTypeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Document type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All documents</SelectItem>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="drivers_license">Driver's license</SelectItem>
                <SelectItem value="national_id">National ID</SelectItem>
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={(v) => { setCountryFilter(v); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {countryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk flags</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : data?.rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">No submissions match your filters.</TableCell></TableRow>
              ) : (
                data?.rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/admin/kyc/${row.id}`)}>
                    <TableCell>
                      <div className="font-medium">{row.profile?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{row.profile?.email || "—"}</div>
                    </TableCell>
                    <TableCell>{row.id_document_country || "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{row.id_document_type?.replace("_", " ") || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.submitted_at ? formatDistanceToNow(new Date(row.submitted_at), { addSuffix: true }) : "—"}
                    </TableCell>
                    <TableCell><KycStatusBadge status={row.verification_status} /></TableCell>
                    <TableCell className="text-sm">{row.reviewer?.full_name || "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost"><Eye className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {data && data.total > PAGE_SIZE && (
            <div className="p-3 flex items-center justify-between text-sm border-t">
              <div className="text-muted-foreground">Page {page + 1} of {totalPages} • {data.total} total</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
};

export default KycQueuePage;
