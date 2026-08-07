import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import TopScrollSync from "@/components/admin-portal/TopScrollSync";
import {
  ANY, DATE_LABEL, DATE_RANGES, FilterChips, compareBy, downloadCsv, prettify,
  useSortState, useUrlFilterSync, type FilterChip,
} from "@/components/admin-portal/TableControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Search, Eye, Building, CheckCircle2, Clock, XCircle, Download } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserCountry, type ResolvedCountry } from "@/lib/userCountry";

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

type Row = BusinessRow & { country: ResolvedCountry };
type SortKey = "name" | "country" | "entity_type" | "kyb_status" | "kyb_tier" | "risk_level" | "created_at";

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
  const [country, setCountry] = useState(params.get("country") || ANY);
  const [entity, setEntity] = useState(params.get("entity") || ANY);
  const [status, setStatus] = useState(params.get("status") || ANY);
  const [tier, setTier] = useState(params.get("tier") || ANY);
  const [risk, setRisk] = useState(params.get("risk") || ANY);
  const [created, setCreated] = useState(params.get("created") || "all");
  const { sortKey, sortDir, SortHead } = useSortState<SortKey>("created_at", "desc");

  useUrlFilterSync({
    q: query,
    country: country !== ANY ? country : null,
    entity: entity !== ANY ? entity : null,
    status: status !== ANY ? status : null,
    tier: tier !== ANY ? tier : null,
    risk: risk !== ANY ? risk : null,
    created: created !== "all" ? created : null,
    sort: sortKey !== "created_at" ? sortKey : null,
    dir: sortDir !== "desc" ? sortDir : null,
  });

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

  const rows: Row[] = useMemo(
    () => businesses.map((b) => ({
      ...b,
      country: resolveUserCountry({
        address_country: b.incorporation_country,
        phone_number: b.business_phone,
      }),
    })),
    [businesses],
  );

  const countryOptions = useMemo(() => {
    const counts = new Map<string, { label: string; flag: string; count: number }>();
    for (const r of rows) {
      const key = r.country.code || "unknown";
      const entry = counts.get(key) || { label: r.country.name, flag: r.country.flag, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    return [...counts.entries()]
      .map(([value, v]) => ({ value, ...v }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [rows]);

  const optionsFrom = (key: "entity_type" | "kyb_status" | "kyb_tier" | "risk_level") =>
    [...new Set(rows.map((r) => r[key]).filter(Boolean) as string[])].sort();

  const entityOptions = useMemo(() => optionsFrom("entity_type"), [rows]);
  const statusOptions = useMemo(() => optionsFrom("kyb_status"), [rows]);
  const tierOptions = useMemo(() => optionsFrom("kyb_tier"), [rows]);
  const riskOptions = useMemo(() => optionsFrom("risk_level"), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const days = DATE_RANGES[created] ?? null;
    const cutoff = days ? Date.now() - days * 86_400_000 : null;

    const matched = rows.filter((b) => {
      if (q) {
        const hit =
          b.legal_name?.toLowerCase().includes(q) ||
          b.operating_name?.toLowerCase().includes(q) ||
          b.registration_number?.toLowerCase().includes(q) ||
          b.business_email?.toLowerCase().includes(q) ||
          b.business_phone?.includes(query.trim()) ||
          b.country.name.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (country !== ANY && (b.country.code || "unknown") !== country) return false;
      if (entity !== ANY && b.entity_type !== entity) return false;
      if (status !== ANY && b.kyb_status !== status) return false;
      if (tier !== ANY && b.kyb_tier !== tier) return false;
      if (risk !== ANY && b.risk_level !== risk) return false;
      if (cutoff && new Date(b.created_at).getTime() < cutoff) return false;
      return true;
    });

    const value = (b: Row): string | number => {
      switch (sortKey) {
        case "name": return (b.legal_name || "").toLowerCase();
        case "country": return b.country.code ? b.country.name.toLowerCase() : "zzz";
        case "entity_type": return b.entity_type || "";
        case "kyb_status": return b.kyb_status || "";
        case "kyb_tier": return b.kyb_tier || "";
        case "risk_level": return b.risk_level || "";
        default: return new Date(b.created_at).getTime();
      }
    };

    return [...matched].sort(compareBy<Row>(value, sortDir));
  }, [rows, query, country, entity, status, tier, risk, created, sortKey, sortDir]);

  const stats = {
    total: businesses.length,
    approved: businesses.filter((b) => b.kyb_status === "approved").length,
    pending: businesses.filter((b) => b.kyb_status === "pending_review" || b.kyb_status === "in_progress").length,
    blocked: businesses.filter((b) => b.kyb_status === "rejected" || b.kyb_status === "suspended").length,
  };

  const chips = [
    country !== ANY && {
      label: `Country: ${countryOptions.find((c) => c.value === country)?.label || country}`,
      clear: () => setCountry(ANY),
    },
    entity !== ANY && { label: `Type: ${prettify(entity)}`, clear: () => setEntity(ANY) },
    status !== ANY && { label: `Status: ${prettify(status)}`, clear: () => setStatus(ANY) },
    tier !== ANY && { label: `Tier: ${prettify(tier)}`, clear: () => setTier(ANY) },
    risk !== ANY && { label: `Risk: ${prettify(risk)}`, clear: () => setRisk(ANY) },
    created !== "all" && { label: `Created: ${DATE_LABEL[created]}`, clear: () => setCreated("all") },
    !!query && { label: `Search: "${query}"`, clear: () => setQuery("") },
  ].filter(Boolean) as FilterChip[];

  const clearAll = () => {
    setQuery(""); setCountry(ANY); setEntity(ANY); setStatus(ANY); setTier(ANY); setRisk(ANY); setCreated("all");
  };

  const exportCsv = () =>
    downloadCsv(
      "efinmoney-businesses",
      ["Legal name", "Operating name", "Type", "Country", "Reg. #", "Email", "Phone", "KYB status", "Tier", "Risk", "Submitted", "Created"],
      filtered.map((b) => [
        b.legal_name, b.operating_name, prettify(b.entity_type), b.country.name, b.registration_number,
        b.business_email, b.business_phone, prettify(b.kyb_status), b.kyb_tier, b.risk_level,
        b.submitted_at ? format(new Date(b.submitted_at), "yyyy-MM-dd") : "",
        format(new Date(b.created_at), "yyyy-MM-dd"),
      ]),
    );

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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
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
          <CardHeader className="gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base">All businesses ({filtered.length})</CardTitle>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search legal name, DBA, reg #, email or phone"
                  className="pl-9"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="w-[190px] h-9"><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All countries</SelectItem>
                  {countryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.flag} {c.label} ({c.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Entity type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All entity types</SelectItem>
                  {entityOptions.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{prettify(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="KYB status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All KYB states</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{prettify(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All tiers</SelectItem>
                  {tierOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={risk} onValueChange={setRisk}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Risk" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All risk levels</SelectItem>
                  {riskOptions.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{prettify(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={created} onValueChange={setCreated}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Created" /></SelectTrigger>
                <SelectContent>
                  {Object.keys(DATE_RANGES).map((k) => (
                    <SelectItem key={k} value={k}>{DATE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <FilterChips chips={chips} onClearAll={clearAll} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (
              <TopScrollSync>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead label="Business" sortKey="name" />
                      <SortHead label="Type" sortKey="entity_type" />
                      <SortHead label="Country" sortKey="country" />
                      <TableHead>Reg. #</TableHead>
                      <SortHead label="Status" sortKey="kyb_status" />
                      <SortHead label="Tier" sortKey="kyb_tier" />
                      <SortHead label="Risk" sortKey="risk_level" />
                      <SortHead label="Created" sortKey="created_at" />
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                          {chips.length > 0 ? "No businesses match your filters" : "No businesses yet"}
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
                        <TableCell className="capitalize text-sm">{prettify(b.entity_type)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <span className="mr-1.5">{b.country.flag}</span>
                          <span className={b.country.code ? "" : "text-muted-foreground"}>{b.country.name}</span>
                          {b.country.source === "phone" && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(from phone)</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{b.registration_number || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLES[b.kyb_status] || "bg-muted text-muted-foreground"}>
                            {prettify(b.kyb_status)}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge variant="outline">{b.kyb_tier}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={RISK_STYLES[b.risk_level] || "bg-muted text-muted-foreground"}>
                            {b.risk_level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(b.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/businesses/${b.id}`)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TopScrollSync>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default BusinessesPage;
