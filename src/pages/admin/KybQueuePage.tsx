import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Search, Eye } from "lucide-react";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import type { KybStatus } from "@/hooks/useKyb";

const db = supabase as unknown as { from: (t: string) => any };

const PAGE_SIZE = 25;

const STATUS_STYLES: Record<KybStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  pending_review: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
  suspended: "bg-red-500/10 text-red-600 border-red-500/20",
};

export const KybStatusBadge = ({ status }: { status: KybStatus }) => (
  <span
    className={`text-xs px-2 py-0.5 rounded border capitalize ${STATUS_STYLES[status] ?? "bg-muted"}`}
  >
    {status.replace(/_/g, " ")}
  </span>
);

const KybQueuePage = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [countryFilter, setCountryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-kyb-queue", statusFilter, countryFilter, search, page],
    queryFn: async () => {
      let q = db
        .from("business_profiles")
        .select(
          "id, owner_user_id, legal_name, operating_name, entity_type, incorporation_country, registration_number, kyb_status, kyb_tier, risk_level, submitted_at, created_at",
          { count: "exact" }
        );

      if (statusFilter !== "all") q = q.eq("kyb_status", statusFilter);
      if (countryFilter !== "all") q = q.eq("incorporation_country", countryFilter);
      if (search.trim()) q = q.ilike("legal_name", `%${search.trim()}%`);

      // Pending queue is oldest-first so nothing ages out; everything else newest-first.
      const ascending = statusFilter === "pending_review";
      q = q.order(ascending ? "submitted_at" : "created_at", { ascending, nullsFirst: false });
      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data: rows, count, error } = await q;
      if (error) throw error;
      return { rows: (rows || []) as any[], total: count || 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">KYB Queue</h1>
          <p className="text-sm text-muted-foreground">
            Review business (SME) verification applications
          </p>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Search legal name"
                  className="pl-9"
                />
              </div>
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending_review">Pending review</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={countryFilter}
              onValueChange={(v) => {
                setCountryFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                <SelectItem value="CA">Canada</SelectItem>
                <SelectItem value="NG">Nigeria</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Reg. number</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : data?.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-12"
                  >
                    No applications match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                data?.rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/kyb/${row.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{row.legal_name}</div>
                      {row.operating_name && (
                        <div className="text-xs text-muted-foreground">{row.operating_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-sm">
                      {row.entity_type?.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>{row.incorporation_country}</TableCell>
                    <TableCell className="text-sm">{row.registration_number || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.submitted_at
                        ? formatDistanceToNow(new Date(row.submitted_at), { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <KybStatusBadge status={row.kyb_status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {row.risk_level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {data && data.total > PAGE_SIZE && (
            <div className="p-3 flex items-center justify-between text-sm border-t">
              <div className="text-muted-foreground">
                Page {page + 1} of {totalPages} • {data.total} total
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
};

export default KybQueuePage;
