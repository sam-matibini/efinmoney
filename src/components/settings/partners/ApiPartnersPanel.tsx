import { useMemo, useState } from "react";
import {
  useApiPartners,
  useApiPartnerKeys,
  useApiRequestLogs,
  useSaveApiPartner,
  useDeleteApiPartner,
  useIssueApiKey,
  useRevokeApiKey,
  type ApiPartner,
} from "@/hooks/useApiPartners";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, Trash2, Pencil, Ban } from "lucide-react";

const SCOPES = ["rates", "corridors", "quote"] as const;

interface FormState {
  id?: string;
  name: string;
  contact_email: string;
  status: string;
  tier: string;
  rate_limit_per_min: string;
  allowed_endpoints: string[];
  notes: string;
}

const emptyForm: FormState = {
  name: "",
  contact_email: "",
  status: "active",
  tier: "standard",
  rate_limit_per_min: "60",
  allowed_endpoints: [...SCOPES],
  notes: "",
};

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

export const ApiPartnersPanel = () => {
  const { data: partners, isLoading } = useApiPartners();
  const { data: keys } = useApiPartnerKeys();
  const { data: logs } = useApiRequestLogs();
  const savePartner = useSaveApiPartner();
  const deletePartner = useDeleteApiPartner();
  const issueKey = useIssueApiKey();
  const revokeKey = useRevokeApiKey();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [newKey, setNewKey] = useState<string | null>(null);

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/partner-api`;

  const keysByPartner = useMemo(() => {
    const m = new Map<string, typeof keys>();
    for (const k of keys ?? []) {
      const list = m.get(k.partner_id) ?? [];
      list.push(k);
      m.set(k.partner_id, list as typeof keys);
    }
    return m;
  }, [keys]);

  const openNew = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: ApiPartner) => {
    setForm({
      id: p.id,
      name: p.name,
      contact_email: p.contact_email ?? "",
      status: p.status,
      tier: p.tier,
      rate_limit_per_min: String(p.rate_limit_per_min ?? 60),
      allowed_endpoints: p.allowed_endpoints ?? [...SCOPES],
      notes: p.notes ?? "",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Partner name is required");
    try {
      await savePartner.mutateAsync({
        id: form.id,
        name: form.name.trim(),
        contact_email: form.contact_email.trim() || null,
        status: form.status,
        tier: form.tier,
        rate_limit_per_min: Number(form.rate_limit_per_min) || 60,
        allowed_endpoints: form.allowed_endpoints,
        notes: form.notes.trim() || null,
      } as never);
      toast.success("Partner saved");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save partner");
    }
  };

  const issue = async (partnerId: string) => {
    try {
      const res = await issueKey.mutateAsync({ partner_id: partnerId, label: "API key" });
      setNewKey(res.key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not issue key");
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const toggleScope = (scope: string) =>
    setForm((f) => ({
      ...f,
      allowed_endpoints: f.allowed_endpoints.includes(scope)
        ? f.allowed_endpoints.filter((s) => s !== scope)
        : [...f.allowed_endpoints, scope],
    }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> API partners
            </CardTitle>
            <CardDescription>
              External partners that query corridor pricing and FX rates over HTTP.
            </CardDescription>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="mr-1 h-4 w-4" /> New partner
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Base URL</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="truncate text-xs text-muted-foreground">{baseUrl}</code>
              <Button variant="ghost" size="icon" onClick={() => copy(baseUrl)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Endpoints: <code>GET /v1/rates</code>, <code>GET /v1/rates/&#123;from&#125;/&#123;to&#125;</code>,{" "}
              <code>GET /v1/corridors</code>, <code>POST /v1/quote</code>. Authenticate with the{" "}
              <code>X-API-Key</code> header.
            </p>
          </div>

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !partners?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No API partners yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Limit / min</TableHead>
                  <TableHead>Keys</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.contact_email ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{(p.allowed_endpoints ?? []).join(", ") || "all"}</TableCell>
                    <TableCell>{p.rate_limit_per_min}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {(keysByPartner.get(p.id) ?? []).map((k) => (
                          <div key={k.id} className="flex items-center gap-2 text-xs">
                            <code className={k.revoked_at ? "line-through text-muted-foreground" : ""}>
                              {k.key_prefix}…
                            </code>
                            <span className="text-muted-foreground">used {fmt(k.last_used_at)}</span>
                            {!k.revoked_at && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => revokeKey.mutate(k.id)}
                                title="Revoke key"
                              >
                                <Ban className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => issue(p.id)} disabled={issueKey.isPending}>
                          Issue key
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deletePartner.mutate(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent API calls</CardTitle>
          <CardDescription>Last 100 partner requests.</CardDescription>
        </CardHeader>
        <CardContent>
          {!logs?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{fmt(l.created_at)}</TableCell>
                    <TableCell className="text-xs">
                      {partners?.find((p) => p.id === l.partner_id)?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.method} {l.endpoint}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.status_code < 400 ? "default" : "destructive"}>{l.status_code}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{l.latency_ms ?? "—"} ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit partner" : "New API partner"}</DialogTitle>
            <DialogDescription>Partners authenticate with an issued key.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Contact email</Label>
              <Input
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Requests / minute</Label>
                <Input
                  type="number"
                  value={form.rate_limit_per_min}
                  onChange={(e) => setForm({ ...form, rate_limit_per_min: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Scopes</Label>
              <div className="mt-2 flex gap-2">
                {SCOPES.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={form.allowed_endpoints.includes(s) ? "default" : "outline"}
                    onClick={() => toggleScope(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={savePartner.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!newKey} onOpenChange={() => setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key issued</DialogTitle>
            <DialogDescription>
              Copy it now — this is the only time the full key is shown.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
            <code className="flex-1 break-all text-xs">{newKey}</code>
            <Button variant="ghost" size="icon" onClick={() => newKey && copy(newKey)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiPartnersPanel;
