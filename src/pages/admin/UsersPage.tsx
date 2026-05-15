import { useState } from "react";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, MoreHorizontal, Eye, ShieldOff, ShieldCheck, Trash2, Users as UsersIcon, UserCheck, UserX, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ProfileRow {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  account_status: string | null;
  kyc_status: string;
  kyc_tier: string;
  avatar_url: string | null;
  created_at: string;
}

const accountStatusVariant = (s: string | null) => {
  switch (s) {
    case "active": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "suspended": return "bg-red-500/10 text-red-500 border-red-500/20";
    case "pending_verification": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "closed": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const kycVariant = (s: string) => {
  switch (s) {
    case "approved":
    case "verified": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "pending":
    case "submitted":
    case "pending_review": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "rejected": return "bg-red-500/10 text-red-500 border-red-500/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const UsersPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [deleteUser, setDeleteUser] = useState<ProfileRow | null>(null);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,full_name,email,phone_number,account_status,kyc_status,kyc_tier,avatar_url,created_at")
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

  const filtered = profiles.filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.phone_number?.includes(query)
    );
  });

  const stats = {
    total: profiles.length,
    active: profiles.filter((p) => p.account_status === "active").length,
    suspended: profiles.filter((p) => p.account_status === "suspended").length,
    pending: profiles.filter((p) => p.account_status === "pending_verification").length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
              <UsersIcon className="w-6 h-6 text-primary" /> Users
            </h1>
            <p className="text-sm text-muted-foreground">Manage all customer accounts</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, icon: UsersIcon, color: "text-primary" },
            { label: "Active", value: stats.active, icon: UserCheck, color: "text-emerald-500" },
            { label: "Suspended", value: stats.suspended, icon: UserX, color: "text-red-500" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-500" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center ${s.color}`}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className="text-xl font-semibold">{s.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">All users ({filtered.length})</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email or phone"
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
                      <TableHead>User</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>KYC</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                          {query ? "No users match your search" : "No users yet"}
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
                              <div className="font-medium truncate">{p.full_name || "No name"}</div>
                              <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.phone_number || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={accountStatusVariant(p.account_status)}>
                            {p.account_status?.replace(/_/g, " ") || "—"}
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
