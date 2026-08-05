import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ListChecks, Send, ExternalLink, AlertCircle, Mail } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any; functions: any };

type Tab = "all" | "claimed" | "unclaimed";

const OnboardedByMePage = () => {
  const { admin } = useAdminAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");

  // Onboarded users (from profiles where onboarded_via='admin' and onboarded_by_admin_id=me)
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["onboarded-users", admin?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select("id, user_id, email, full_name, onboarded_at, kyc_tier, account_status")
        .eq("onboarded_by_admin_id", admin!.id)
        .order("onboarded_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        user_id: string;
        email: string | null;
        full_name: string | null;
        onboarded_at: string;
        kyc_tier: string;
        account_status: string;
      }>;
    },
    enabled: !!admin,
  });

  // Onboarded businesses (from customers)
  const { data: businesses, isLoading: bizLoading } = useQuery({
    queryKey: ["onboarded-businesses", admin?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("customers")
        .select("id, name, email, kyc_status, onboarded_at")
        .eq("onboarded_by_admin_id", admin!.id)
        .order("onboarded_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        name: string;
        email: string | null;
        kyc_status: string;
        onboarded_at: string;
      }>;
    },
    enabled: !!admin,
  });

  // Last sign-in to determine claimed vs unclaimed
  const { data: lastSignIns } = useQuery({
    queryKey: ["onboarded-last-signin", users?.map((u) => u.user_id)],
    queryFn: async () => {
      if (!users || users.length === 0) return {} as Record<string, string | null>;
      // Use auth.admin.listUsers via RPC? Simpler: query admin_orphaned_invitations for
      // the unclaimed ones; for claimed, just mark all others as claimed.
      const { data: orphans } = await db
        .from("admin_orphaned_invitations")
        .select("user_id");
      const orphanIds = new Set((orphans || []).map((o: { user_id: string }) => o.user_id));
      const result: Record<string, string | null> = {};
      for (const u of users) {
        result[u.user_id] = orphanIds.has(u.user_id) ? null : "claimed";
      }
      return result;
    },
    enabled: !!users,
  });

  const resend = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke("admin-resend-invite", {
        body: { email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_d, email) => {
      toast.success(`Invite re-sent to ${email}`);
      qc.invalidateQueries({ queryKey: ["onboarded-users"] });
      qc.invalidateQueries({ queryKey: ["onboarded-last-signin"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not resend invite");
    },
  });

  const filteredUsers = (users || []).filter((u) => {
    if (tab === "all") return true;
    const claimed = lastSignIns?.[u.user_id] === "claimed";
    if (tab === "claimed") return claimed;
    if (tab === "unclaimed") return !claimed;
    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
              <ListChecks className="w-7 h-7 text-primary" /> Onboarded by Me
            </h1>
            <p className="text-sm text-muted-foreground">
              Users and businesses you have onboarded. Resend the invite if they haven't claimed.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="all">All ({users?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="unclaimed">
              Unclaimed
              {lastSignIns && Object.values(lastSignIns).filter((v) => !v).length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {Object.values(lastSignIns).filter((v) => !v).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="claimed">Claimed</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Individuals you onboarded via the Developer tab.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {usersLoading ? (
              <div className="p-6 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No users in this view.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>KYC tier</TableHead>
                    <TableHead>Onboarded</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const claimed = lastSignIns?.[u.user_id] === "claimed";
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell><Badge variant="outline">{u.kyc_tier}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.onboarded_at ? formatDistanceToNow(new Date(u.onboarded_at), { addSuffix: true }) : ""}
                        </TableCell>
                        <TableCell>
                          {claimed ? (
                            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                              Claimed
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="w-3 h-3" /> Unclaimed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {!claimed && u.email && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resend.mutate(u.email!)}
                              disabled={resend.isPending}
                            >
                              <Send className="w-3.5 h-3.5 mr-1" /> Resend
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/admin/users/${u.user_id}`}>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Businesses</CardTitle>
            <CardDescription>Businesses you onboarded via the Developer tab.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {bizLoading ? (
              <div className="p-6 space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !businesses || businesses.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No businesses onboarded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Legal name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>KYB status</TableHead>
                    <TableHead>Onboarded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {businesses.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-muted-foreground">{b.email || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{b.kyc_status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.onboarded_at ? formatDistanceToNow(new Date(b.onboarded_at), { addSuffix: true }) : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default OnboardedByMePage;
