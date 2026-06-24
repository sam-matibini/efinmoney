import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Plus, Copy, Key, Eye, Activity, LinkIcon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function AuditorPortalPage() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: auditors = [], isLoading } = useQuery({
    queryKey: ["auditor-access"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("auditor_access").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["audit-sessions"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("audit_sessions").select("*").order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await (supabase as any).from("auditor_access").insert({
        email: inviteEmail,
        access_token: token,
        token_expires_at: expiresAt,
      });
      return token;
    },
    onSuccess: (token) => {
      qc.invalidateQueries({ queryKey: ["auditor-access"] });
      setShowInvite(false);
      setInviteEmail("");
      toast.success("Auditor invited", {
        description: `Access token: ${token.substring(0, 12)}...`,
      });
    },
    onError: () => toast.error("Failed to invite auditor"),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("auditor_access").update({ is_active: false }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auditor-access"] }),
  });

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("Token copied to clipboard");
  };

  const active = auditors.filter((a: any) => a.is_active).length;

  return (
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Auditor Portal</h1>
          <p className="text-muted-foreground">Read-only access for external auditors with session logging</p>
        </div>
        <Button onClick={() => setShowInvite(true)}><Plus className="w-4 h-4 mr-1" />Invite Auditor</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{auditors.length}</div><div className="text-xs text-muted-foreground">Total invited</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{active}</div><div className="text-xs text-muted-foreground">Active</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-blue-500">{sessions.length}</div><div className="text-xs text-muted-foreground">Session logs</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" />Auditor Access</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div> : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Token</TableHead><TableHead>Token Expires</TableHead><TableHead>Last Accessed</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {auditors.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No auditors invited yet.</TableCell></TableRow> : auditors.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.email}</TableCell>
                    <TableCell>
                      {a.is_active ? <Badge className="bg-emerald-500/10 text-emerald-600">Active</Badge> : <Badge className="bg-muted">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {a.access_token ? (
                        <Button variant="ghost" size="sm" className="h-6 gap-1" onClick={() => copyToken(a.access_token)}>
                          <Copy className="w-3 h-3" />{a.access_token.substring(0, 10)}...
                        </Button>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{a.token_expires_at ? format(new Date(a.token_expires_at), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-xs">{a.last_accessed ? formatDistanceToNow(new Date(a.last_accessed), { addSuffix: true }) : "Never"}</TableCell>
                    <TableCell className="text-right">
                      {a.is_active && <Button size="sm" variant="outline" className="text-red-500" onClick={() => deactivateMutation.mutate(a.id)}>Deactivate</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5" />Audit Sessions</CardTitle><p className="text-sm text-muted-foreground">Recent auditor viewing activity</p></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Auditor</TableHead><TableHead>IP Address</TableHead><TableHead>Actions</TableHead><TableHead>Session Start</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No sessions recorded.</TableCell></TableRow> : sessions.map((s: any) => {
                const auditor = auditors.find((a: any) => a.id === s.auditor_access_id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-xs">{auditor?.email || "Unknown"}</TableCell>
                    <TableCell className="text-xs font-mono">{s.ip_address || "—"}</TableCell>
                    <TableCell><Badge className="bg-blue-500/10 text-blue-600">{s.actions_performed} actions</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(s.created_at), "MMM d, yyyy h:mm a")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite External Auditor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Auditor Email</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="auditor@firm.com" type="email" />
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <LinkIcon className="w-3.5 h-3.5" />A 7-day access token will be generated for read-only portal access.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending || !inviteEmail}>
              {inviteMutation.isPending ? "Inviting..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}