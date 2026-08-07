import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, MoreHorizontal, Eye, ShieldOff, ShieldCheck, Trash2, Users as UsersIcon,
  UserCheck, UserX, Clock, ArrowUp, ArrowDown, ChevronsUpDown, X, Download,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { resolveUserCountry, type ResolvedCountry } from "@/lib/userCountry";

interface ProfileRow {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  account_number: string | null;
  efin_tag: string | null;
  account_status: string | null;
  kyc_status: string;
  kyc_tier: string;
  avatar_url: string | null;
  country_code: string | null;
  address_country: string | null;
  created_at: string;
}

type Row = ProfileRow & { country: ResolvedCountry };

type SortKey = "name" | "country" | "account_status" | "kyc_status" | "kyc_tier" | "created_at";
type SortDir = "asc" | "desc";

const ANY = "all";

const accountStatusVariant = (s: string | null) => {
  switch (s) {
    case "active": return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    case "suspended": return "bg-red-500/10 text-red-500 border-red-500/20";
    case "pending_verification": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "closed": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const kycVariant = (s: string) => {
  switch (s) {
    case "approved":
    case "verified": return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    case "pending":
    case "submitted":
    case "pending_review": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "rejected": return "bg-red-500/10 text-red-500 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const displayName = (fullName: string | null, email: string | null) => {
  if (fullName && fullName.trim()) return fullName;
  if (email) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "No name";
};

const prettify = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "—");

const JOINED_RANGES: Record<string, number | null> = { all: null, "7d": 7, "30d": 30, "90d": 90 };
const JOINED_LABEL: Record<string, string> = {
  all: "Any time", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days",
};

const UsersPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState(params.get("q") || "");
  const [country, setCountry] = useState(params.get("country") || ANY);
  const [status, setStatus] = useState(params.get("status") || ANY);
  const [kyc, setKyc] = useState(params.get("kyc") || ANY);
  const [tier, setTier] = useState(params.get("tier") || ANY);
  const [joined, setJoined] = useState(params.get("joined") || "all");
  const [sortKey, setSortKey] = useState<SortKey>((params.get("sort") as SortKey) || "created_at");
  const [sortDir, setSortDir] = useState<SortDir>((params.get("dir") as SortDir) || "desc");
  const [deleteUser, setDeleteUser] = useState<ProfileRow | null>(null);

  // Keep the URL in sync so a filtered view can be shared or reloaded.
  useEffect(() => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (country !== ANY) next.set("country", country);
    if (status !== ANY) next.set("status", status);
    if (kyc !== ANY) next.set("kyc", kyc);
    if (tier !== ANY) next.set("tier", tier);
    if (joined !== "all") next.set("joined", joined);
    if (sortKey !== "created_at") next.set("sort", sortKey);
    if (sortDir !== "desc") next.set("dir", sortDir);
    setParams(next, { replace: true });
  }, [query, country, status, kyc, tier, joined, sortKey, sortDir, setParams]);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,full_name,email,phone_number,account_number,efin_tag,account_status,kyc_status,kyc_tier,avatar_url,country_code,address_country,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as ProfileRow[];
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (p: ProfileRow) => {
      const next = p.account_status === "suspended" ? "active" : "suspended";
      const { error } = await supabase
        .from("profiles")
        .update({ account_status: next })
        .eq("user_id", p.user_id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
      toast.success(`User ${next === "suspended" ? "suspended" : "activated"}`);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update status"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (p: ProfileRow) => {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { user_id: p.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
      toast.success("User deleted");
      setDeleteUser(null);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete user"),
  });

  const rows: Row[] = useMemo(
    () => profiles.map((p) => ({ ...p, country: resolveUserCountry(p) })),
    [profiles],
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

  const optionsFrom = (key: "account_status" | "kyc_status" | "kyc_tier") =>
    [...new Set(rows.map((r) => r[key]).filter(Boolean) as string[])].sort();

  const statusOptions = useMemo(() => optionsFrom("account_status"), [rows]);
  const kycOptions = useMemo(() => optionsFrom("kyc_status"), [rows]);
  const tierOptions = useMemo(() => optionsFrom("kyc_tier"), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const days = JOINED_RANGES[joined] ?? null;
    const cutoff = days ? Date.now() - days * 86_400_000 : null;

    const matched = rows.filter((p) => {
      if (q) {
        const hit =
          p.full_name?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q) ||
          p.phone_number?.includes(query.trim()) ||
          p.account_number?.includes(query.trim()) ||
          p.efin_tag?.toLowerCase().includes(q.replace(/^@/, "")) ||
          p.country.name.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (country !== ANY && (p.country.code || "unknown") !== country) return false;
      if (status !== ANY && p.account_status !== status) return false;
      if (kyc !== ANY && p.kyc_status !== kyc) return false;
      if (tier !== ANY && p.kyc_tier !== tier) return false;
      if (cutoff && new Date(p.created_at).getTime() < cutoff) return false;
      return true;
    });

    const value = (p: Row) => {
      switch (sortKey) {
        case "name": return displayName(p.full_name, p.email).toLowerCase();
        case "country": return p.country.code ? p.country.name.toLowerCase() : "zzz";
        case "account_status": return p.account_status || "";
        case "kyc_status": return p.kyc_status || "";
        case "kyc_tier": return p.kyc_tier || "";
        default: return new Date(p.created_at).getTime();
      }
    };

    return [...matched].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, query, country, status, kyc, tier, joined, sortKey, sortDir]);

  const stats = {
    total: profiles.length,
    active: profiles.filter((p) => p.account_status === "active").length,
    suspended: profiles.filter((p) => p.account_status === "suspended").length,
    pending: profiles.filter((p) => p.account_status === "pending_verification").length,
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  };

  const SortHead = ({ label, sortKey: key, className }: { label: string; sortKey: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {sortKey === key ? (
          sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  const activeChips = [
    country !== ANY && {
      label: `Country: ${countryOptions.find((c) => c.value === country)?.label || country}`,
      clear: () => setCountry(ANY),
    },
    status !== ANY && { label: `Account: ${prettify(status)}`, clear: () => setStatus(ANY) },
    kyc !== ANY && { label: `KYC: ${prettify(kyc)}`, clear: () => setKyc(ANY) },
    tier !== ANY && { label: `Tier: ${prettify(tier)}`, clear: () => setTier(ANY) },
    joined !== "all" && { label: `Joined: ${JOINED_LABEL[joined]}`, clear: () => setJoined("all") },
    !!query && { label: `Search: "${query}"`, clear: () => setQuery("") },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  const clearAll = () => {
    setQuery(""); setCountry(ANY); setStatus(ANY); setKyc(ANY); setTier(ANY); setJoined("all");
  };

  const exportCsv = () => {
    const header = ["Name", "Email", "Country", "Account #", "@Tag", "Phone", "Account status", "KYC", "Tier", "Joined"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      header.join(","),
      ...filtered.map((p) => [
        displayName(p.full_name, p.email), p.email, p.country.name, p.account_number,
        p.efin_tag ? `@${p.efin_tag}` : "", p.phone_number, prettify(p.account_status),
        p.kyc_status, p.kyc_tier, format(new Date(p.created_at), "yyyy-MM-dd"),
      ].map(esc).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `efinmoney-users-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
              <UsersIcon className="w-7 h-7 text-primary" /> Users
            </h1>
            <p className="text-sm text-muted-foreground">Manage all customer accounts</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, icon: UsersIcon, color: "text-primary", bg: "bg-primary/10" },
            { label: "Active", value: stats.active, icon: UserCheck, color: "text-primary", bg: "bg-primary/10" },
            { label: "Suspended", value: stats.suspended, icon: UserX, color: "text-destructive", bg: "bg-destructive/10" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
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
              <CardTitle className="text-base">All users ({filtered.length})</CardTitle>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, phone, @tag or acct #"
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
                    <SelectItem key={c.value} value={c.value}>
                      {c.flag} {c.label} ({c.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Account status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All account statuses</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{prettify(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={kyc} onValueChange={setKyc}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="KYC" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All KYC states</SelectItem>
                  {kycOptions.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{prettify(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All tiers</SelectItem>
                  {tierOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={joined} onValueChange={setJoined}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Joined" /></SelectTrigger>
                <SelectContent>
                  {Object.keys(JOINED_RANGES).map((k) => (
                    <SelectItem key={k} value={k}>{JOINED_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {activeChips.map((c) => (
                  <Badge key={c.label} variant="secondary" className="gap-1 font-normal">
                    {c.label}
                    <button type="button" onClick={c.clear} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll}>
                  Clear all
                </Button>
              </div>
            )}
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
                      <SortHead label="User" sortKey="name" />
                      <SortHead label="Country" sortKey="country" />
                      <TableHead>Account #</TableHead>
                      <TableHead>@Tag</TableHead>
                      <TableHead>Phone</TableHead>
                      <SortHead label="Account" sortKey="account_status" />
                      <SortHead label="KYC" sortKey="kyc_status" />
                      <SortHead label="Tier" sortKey="kyc_tier" />
                      <SortHead label="Joined" sortKey="created_at" />
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                          {activeChips.length > 0 ? "No users match your filters" : "No users yet"}
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/admin/users/${p.user_id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9">
                              <AvatarImage src={p.avatar_url || undefined} />
                              <AvatarFallback>{(p.full_name || p.email || "U").charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{displayName(p.full_name, p.email)}</div>
                              <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <span className="mr-1.5">{p.country.flag}</span>
                          <span className={p.country.code ? "" : "text-muted-foreground"}>{p.country.name}</span>
                          {p.country.source === "phone" && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(from phone)</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.account_number || "—"}</TableCell>
                        <TableCell className="text-sm">{p.efin_tag ? `@${p.efin_tag}` : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.phone_number || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={accountStatusVariant(p.account_status)}>
                            {prettify(p.account_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={kycVariant(p.kyc_status)}>
                            {p.kyc_status}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge variant="outline">{p.kyc_tier}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(p.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/admin/users/${p.user_id}`)}>
                                <Eye className="w-4 h-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleStatusMutation.mutate(p)}>
                                {p.account_status === "suspended" ? (
                                  <><ShieldCheck className="w-4 h-4 mr-2" /> Activate</>
                                ) : (
                                  <><ShieldOff className="w-4 h-4 mr-2" /> Suspend</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteUser(p)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      <AlertDialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{deleteUser?.email}</strong> and all associated data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default UsersPage;
