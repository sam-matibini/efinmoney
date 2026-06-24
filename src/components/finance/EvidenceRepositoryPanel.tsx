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
import { FileText, Upload, Clock, AlertTriangle, Plus, HardDrive } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const categoryLabel = (c: string) => c.replace(/_/g, " ").toUpperCase();
const categoryBadgeColor = (c: string) => {
  const m: Record<string, string> = {
    kyc: "bg-blue-500/10 text-blue-600",
    aml_investigation: "bg-red-500/10 text-red-600",
    str_filing: "bg-orange-500/10 text-orange-600",
    reconciliation: "bg-purple-500/10 text-purple-600",
    bank_statement: "bg-emerald-500/10 text-emerald-600",
    board_approval: "bg-amber-500/10 text-amber-600",
    audit: "bg-slate-500/10 text-slate-600",
    other: "bg-muted",
  };
  return m[c] || "bg-muted";
};

export const EvidenceRepositoryPanel = () => {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [newFile, setNewFile] = useState({ category: "other" as string, file_name: "", notes: "" });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["evidence-records"],
    queryFn: async () => {
      const { data } = await supabase.from("evidence_records").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const { data: expiring = [] } = useQuery({
    queryKey: ["retention-expiry"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data } = await db.from("retention_expiry_view").select("*");
      return data || [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("evidence_records").insert({
        category: newFile.category,
        file_name: newFile.file_name || "uploaded-file",
        file_path: `evidence/${Date.now()}-${newFile.file_name || "file"}`,
        notes: newFile.notes || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evidence-records"] });
      qc.invalidateQueries({ queryKey: ["retention-expiry"] });
      setShowUpload(false);
      setNewFile({ category: "other", file_name: "", notes: "" });
      toast.success("Evidence record added");
    },
    onError: () => toast.error("Failed to add record"),
  });

  const totalRecords = records.length;
  const expiringCount = (expiring as any[]).length;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{totalRecords}</div>
            <div className="text-xs text-muted-foreground">Total evidence records</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-amber-500">{expiringCount}</div>
            <div className="text-xs text-muted-foreground">Expiring within 60 days</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-blue-500">{records.filter((r: any) => r.category === "kyc").length}</div>
            <div className="text-xs text-muted-foreground">KYC records</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><HardDrive className="w-5 h-5" />Evidence Repository</CardTitle>
            <p className="text-sm text-muted-foreground">7-year retention archive — KYC, AML, reconciliations, board approvals & more</p>
          </div>
          <Button onClick={() => setShowUpload(true)}><Plus className="w-4 h-4 mr-1" />Add Record</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Retention Until</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No evidence records. Upload your first regulatory evidence file.</TableCell></TableRow>
                ) : records.map((r: any) => {
                  const daysLeft = r.retention_until ? Math.ceil((new Date(r.retention_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                  const isExpiringSoon = daysLeft !== null && daysLeft <= 60;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        {r.file_name}
                      </TableCell>
                      <TableCell><Badge className={categoryBadgeColor(r.category)}>{categoryLabel(r.category)}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {r.retention_until ? (
                          <span className={isExpiringSoon ? "text-amber-500 flex items-center gap-1" : ""}>
                            {isExpiringSoon && <AlertTriangle className="w-3 h-3" />}
                            {format(new Date(r.retention_until), "MMM d, yyyy")}
                            {daysLeft !== null && <span className="text-muted-foreground ml-1">({daysLeft}d)</span>}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {expiringCount > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600"><Clock className="w-5 h-5" />Retention Expiring (60 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>File</TableHead><TableHead>Category</TableHead><TableHead>Expires</TableHead><TableHead>Days Left</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(expiring as any[]).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.file_name}</TableCell>
                    <TableCell><Badge className={categoryBadgeColor(e.category)}>{categoryLabel(e.category)}</Badge></TableCell>
                    <TableCell className="text-xs">{format(new Date(e.retention_until), "MMM d, yyyy")}</TableCell>
                    <TableCell><Badge className="bg-amber-500/10 text-amber-600">{Math.ceil(e.days_remaining / (1000 * 60 * 60 * 24))} days</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Evidence Record</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>File Name</Label>
              <Input value={newFile.file_name} onChange={(e) => setNewFile({ ...newFile, file_name: e.target.value })} placeholder="e.g., 2026-Q1-reconciliation.pdf" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={newFile.category} onValueChange={(v) => setNewFile({ ...newFile, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kyc">KYC</SelectItem>
                  <SelectItem value="aml_investigation">AML Investigation</SelectItem>
                  <SelectItem value="str_filing">STR Filing</SelectItem>
                  <SelectItem value="reconciliation">Reconciliation</SelectItem>
                  <SelectItem value="bank_statement">Bank Statement</SelectItem>
                  <SelectItem value="board_approval">Board Approval</SelectItem>
                  <SelectItem value="audit">Audit</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={newFile.notes} onChange={(e) => setNewFile({ ...newFile, notes: e.target.value })} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? "Adding..." : "Add Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};