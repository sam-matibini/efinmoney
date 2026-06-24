import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Shield, ShieldAlert, UserCheck, Percent, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useBeneficialOwners, useCreateBeneficialOwner, useUpdateBeneficialOwner, useDeleteBeneficialOwner, BeneficialOwner } from "@/hooks/useBeneficialOwners";

const pepBadge = (status: BeneficialOwner["pep_status"]) => {
  if (status === "none") return <Badge className="bg-emerald-500/10 text-emerald-600">Clear</Badge>;
  if (status === "foreign_pep") return <Badge className="bg-red-500/10 text-red-600">Foreign PEP</Badge>;
  if (status === "domestic_pep") return <Badge className="bg-amber-500/10 text-amber-600">Domestic PEP</Badge>;
  if (status === "hio") return <Badge className="bg-red-500/10 text-red-600">HIO</Badge>;
  return <Badge className="bg-orange-500/10 text-orange-600">{status.replace(/_/g, " ")}</Badge>;
};

const sanctionsBadge = (status: BeneficialOwner["sanctions_status"]) => {
  if (status === "clear") return <Badge className="bg-emerald-500/10 text-emerald-600">Clear</Badge>;
  if (status === "hit") return <Badge className="bg-red-500/10 text-red-600">HIT</Badge>;
  if (status === "escalated") return <Badge className="bg-red-600/10 text-red-600">Escalated</Badge>;
  return <Badge className="bg-muted text-muted-foreground">Not Screened</Badge>;
};

const PEP_OPTIONS = ["none", "domestic_pep", "foreign_pep", "hio", "family_member", "close_associate"];
const SANCTIONS_OPTIONS = ["not_screened", "clear", "hit", "escalated"];

export const BeneficialOwnersPanel = ({ customerId, customerName }: { customerId: string; customerName?: string }) => {
  const [showAdd, setShowAdd] = useState(false);
  const { data: owners = [], isLoading } = useBeneficialOwners(customerId);
  const createOwner = useCreateBeneficialOwner();
  const updateOwner = useUpdateBeneficialOwner();
  const deleteOwner = useDeleteBeneficialOwner();

  const totalOwnership = owners.reduce((sum, o) => sum + o.ownership_pct, 0);
  const pepCount = owners.filter((o) => o.pep_status !== "none").length;
  const sanctionsHitCount = owners.filter((o) => o.sanctions_status === "hit" || o.sanctions_status === "escalated").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Beneficial Ownership Registry
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {customerName || "Business"} — FINTRAC 25% threshold
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Owner
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary strips */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">Total Ownership</div>
            <div className={`text-lg font-bold ${totalOwnership > 100 ? "text-red-500" : totalOwnership < 100 ? "text-amber-500" : "text-emerald-500"}`}>
              {totalOwnership}%
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">PEP / HIO</div>
            <div className={`text-lg font-bold ${pepCount > 0 ? "text-red-500" : "text-emerald-500"}`}>
              {pepCount}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">Sanctions Hits</div>
            <div className={`text-lg font-bold ${sanctionsHitCount > 0 ? "text-red-500" : "text-emerald-500"}`}>
              {sanctionsHitCount}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Ownership</TableHead>
                  <TableHead className="text-right">Voting</TableHead>
                  <TableHead className="text-right">Control</TableHead>
                  <TableHead>PEP Status</TableHead>
                  <TableHead>Sanctions</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No beneficial owners recorded. Add UBOs at the 25% threshold.
                    </TableCell>
                  </TableRow>
                ) : (
                  owners.map((o) => (
                    <TableRow key={o.id} className={o.ownership_pct >= 25 ? "bg-amber-500/5" : ""}>
                      <TableCell className="font-medium">
                        <div>{o.full_name}</div>
                        {o.nationality && <div className="text-xs text-muted-foreground">{o.nationality}</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={o.ownership_pct >= 25 ? "text-amber-500 font-bold" : ""}>{o.ownership_pct}%</span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{o.voting_pct}%</TableCell>
                      <TableCell className="text-right font-mono">{o.control_pct}%</TableCell>
                      <TableCell>{pepBadge(o.pep_status)}</TableCell>
                      <TableCell>{sanctionsBadge(o.sanctions_status)}</TableCell>
                      <TableCell>
                        {o.verified_at ? (
                          <div className="flex items-center gap-1 text-emerald-500 text-sm">
                            <UserCheck className="w-3.5 h-3.5" />
                            {format(new Date(o.verified_at), "MMM d")}
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => updateOwner.mutate({ id: o.id, customer_id: customerId, verified: true } as any)}
                          >
                            Verify
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              if (window.confirm(`Remove ${o.full_name} as beneficial owner?`)) {
                                deleteOwner.mutate({ id: o.id, customerId }, {
                                  onSuccess: () => toast.success("Owner removed"),
                                  onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                                });
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {totalOwnership > 100 && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            Total ownership exceeds 100% — please review.
          </div>
        )}
      </CardContent>

      <AddOwnerDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={(p) => {
          createOwner.mutate(p, {
            onSuccess: () => { setShowAdd(false); toast.success("Owner added"); },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
          });
        }}
        isPending={createOwner.isPending}
      />
    </Card>
  );
};

function AddOwnerDialog({
  open, onClose, onSubmit, isPending,
}: {
  open: boolean; onClose: () => void;
  onSubmit: (p: any) => void; isPending: boolean;
}) {
  const f = { full_name: "", ownership_pct: 0, voting_pct: 0, control_pct: 0, nationality: "", pep_status: "none", sanctions_status: "not_screened" as const, dob: null as string | null, address: null as string | null };
  const [form, setForm] = useState(f);
  const handle = () => { if (!form.full_name.trim()) return; onSubmit(form); };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Beneficial Owner</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full Name *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Legal name" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Ownership %</Label><Input type="number" value={form.ownership_pct || ""} onChange={(e) => setForm({ ...form, ownership_pct: Number(e.target.value) })} /></div>
            <div><Label>Voting %</Label><Input type="number" value={form.voting_pct || ""} onChange={(e) => setForm({ ...form, voting_pct: Number(e.target.value) })} /></div>
            <div><Label>Control %</Label><Input type="number" value={form.control_pct || ""} onChange={(e) => setForm({ ...form, control_pct: Number(e.target.value) })} /></div>
          </div>
          <div><Label>Nationality</Label><Input value={form.nationality || ""} onChange={(e) => setForm({ ...form, nationality: e.target.value })} placeholder="e.g., Kenya" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>PEP Status</Label>
              <Select value={form.pep_status} onValueChange={(v) => setForm({ ...form, pep_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PEP_OPTIONS.map((s) => (<SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sanctions</Label>
              <Select value={form.sanctions_status} onValueChange={(v) => setForm({ ...form, sanctions_status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SANCTIONS_OPTIONS.map((s) => (<SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handle} disabled={isPending || !form.full_name.trim()}>{isPending ? "Adding..." : "Add Owner"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}