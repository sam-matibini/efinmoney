import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ShieldAlert, WifiOff, Clock, CheckCircle2, Plus, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useIncidents, useIncidentDetail, useCreateIncident, useUpdateIncident, useAddIncidentComment, Incident, IncidentTimelineEntry } from "@/hooks/useIncidents";

const severityBadge = (s: Incident["severity"]) => {
  const map: Record<string, { c: string; label: string }> = {
    critical: { c: "bg-red-600/10 text-red-600", label: "Critical" },
    high: { c: "bg-orange-500/10 text-orange-600", label: "High" },
    medium: { c: "bg-amber-500/10 text-amber-600", label: "Medium" },
    low: { c: "bg-blue-500/10 text-blue-600", label: "Low" },
  };
  const m = map[s] || map.medium;
  return <Badge className={m.c}>{m.label}</Badge>;
};

const statusBadge = (s: Incident["status"]) => {
  const map: Record<string, { c: string; label: string }> = {
    open: { c: "bg-red-500/10 text-red-600", label: "Open" },
    investigating: { c: "bg-amber-500/10 text-amber-600", label: "Investigating" },
    root_cause_analysis: { c: "bg-purple-500/10 text-purple-600", label: "Root Cause" },
    corrective_action: { c: "bg-blue-500/10 text-blue-600", label: "Correcting" },
    closed: { c: "bg-emerald-500/10 text-emerald-600", label: "Closed" },
    reopened: { c: "bg-red-500/10 text-red-600", label: "Reopened" },
  };
  const m = map[s] || map.open;
  return <Badge className={m.c}>{m.label}</Badge>;
};

const categoryIcon = (c: Incident["category"]) => {
  switch (c) {
    case "service_outage": return <WifiOff className="w-4 h-4" />;
    case "security_breach": return <ShieldAlert className="w-4 h-4" />;
    case "safeguarding_failure": return <AlertTriangle className="w-4 h-4" />;
    case "fraud_event": return <AlertCircle className="w-4 h-4" />;
    default: return <AlertTriangle className="w-4 h-4" />;
  }
};

const categoryLabel = (c: Incident["category"]) => c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

const SEVERITY_OPTIONS = ["low", "medium", "high", "critical"];
const CATEGORY_OPTIONS = ["service_outage", "security_breach", "safeguarding_failure", "fraud_event", "processor_outage", "compliance_breach", "other"];
const STATUS_OPTIONS = ["open", "investigating", "root_cause_analysis", "corrective_action", "closed", "reopened"];

export const IncidentsPanel = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);

  const { data: incidents = [], isLoading } = useIncidents(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const { data: detail } = useIncidentDetail(selectedId);
  const createIncident = useCreateIncident();
  const updateIncident = useUpdateIncident();
  const addComment = useAddIncidentComment();

  const openCount = incidents.filter((i) => i.status !== "closed").length;
  const rpaaCount = incidents.filter((i) => i.is_rpaa_significant && i.status !== "closed").length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{incidents.length}</div>
            <div className="text-xs text-muted-foreground">Total incidents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-red-500">{openCount}</div>
            <div className="text-xs text-muted-foreground">Open / active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-amber-500">{rpaaCount}</div>
            <div className="text-xs text-muted-foreground">RPAA significant</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-emerald-500">{incidents.filter((i) => i.status === "closed").length}</div>
            <div className="text-xs text-muted-foreground">Resolved</div>
          </CardContent>
        </Card>
      </div>

      {/* Main table */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Incident Management</CardTitle>
            <p className="text-sm text-muted-foreground">
              Track operational incidents, root causes, and corrective actions (RPAA)
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>RPAA</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No incidents recorded.
                      </TableCell>
                    </TableRow>
                  ) : (
                    incidents.map((i) => (
                      <TableRow key={i.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedId(i.id)}>
                        <TableCell className="font-medium max-w-48 truncate">{i.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            {categoryIcon(i.category)}
                            {categoryLabel(i.category)}
                          </div>
                        </TableCell>
                        <TableCell>{severityBadge(i.severity)}</TableCell>
                        <TableCell>{statusBadge(i.status)}</TableCell>
                        <TableCell>
                          {i.is_rpaa_significant ? (
                            <Badge className="bg-red-500/10 text-red-600">RPAA</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {format(new Date(i.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      {detail && (
        <IncidentDetailDialog
          incident={detail.incident}
          timeline={detail.timeline}
          onClose={() => setSelectedId(undefined)}
          onUpdate={(updates) => updateIncident.mutateAsync({ id: detail.incident.id, ...updates })}
          onComment={(comment) => addComment.mutateAsync({ id: detail.incident.id, comment })}
        />
      )}

      {/* Create dialog */}
      <CreateIncidentDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={(p) => {
          createIncident.mutate(p, {
            onSuccess: () => {
              setShowCreate(false);
              toast.success("Incident created");
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create incident"),
          });
        }}
        isPending={createIncident.isPending}
      />
    </div>
  );
};

function IncidentDetailDialog({
  incident,
  timeline,
  onClose,
  onUpdate,
  onComment,
}: {
  incident: Incident;
  timeline: IncidentTimelineEntry[];
  onClose: () => void;
  onUpdate: (u: Record<string, unknown>) => Promise<unknown>;
  onComment: (c: string) => Promise<unknown>;
}) {
  const [status, setStatus] = useState<Incident["status"]>(incident.status);
  const [comment, setComment] = useState("");
  const [rootCause, setRootCause] = useState(incident.root_cause || "");
  const [correctiveAction, setCorrectiveAction] = useState(incident.corrective_action || "");
  const [saving, setSaving] = useState(false);

  const handleUpdate = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      await onUpdate(updates);
      toast.success("Updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await onComment(comment.trim());
      setComment("");
      toast.success("Comment added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add comment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {categoryIcon(incident.category)}
            {incident.title}
            {incident.is_rpaa_significant && (
              <Badge className="bg-red-500/10 text-red-600 ml-2">RPAA Significant</Badge>
            )}
          </DialogTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{categoryLabel(incident.category)}</span>
            {severityBadge(incident.severity)}
            {statusBadge(incident.status)}
            <span>{format(new Date(incident.created_at), "MMM d, yyyy h:mm a")}</span>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {incident.description && (
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <p className="text-sm mt-1">{incident.description}</p>
            </div>
          )}

          {incident.impact && (
            <div>
              <Label className="text-xs text-muted-foreground">Impact</Label>
              <p className="text-sm mt-1 text-red-500">{incident.impact}</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v as Incident["status"]); handleUpdate({ status: v }); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={() => handleUpdate({ status: "closed" })} disabled={saving || incident.status === "closed"}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Close Incident
              </Button>
            </div>
          </div>

          <div>
            <Label>Root Cause</Label>
            <div className="flex gap-2 mt-1">
              <Input value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="Identify root cause..." />
              <Button size="sm" variant="outline" onClick={() => handleUpdate({ root_cause: rootCause })} disabled={saving || !rootCause.trim()}>Save</Button>
            </div>
          </div>

          <div>
            <Label>Corrective Action</Label>
            <div className="flex gap-2 mt-1">
              <Input value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="Describe corrective action..." />
              <Button size="sm" variant="outline" onClick={() => handleUpdate({ corrective_action: correctiveAction })} disabled={saving || !correctiveAction.trim()}>Save</Button>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <Label className="text-xs text-muted-foreground">Timeline</Label>
            <div className="space-y-2 mt-2 max-h-48 overflow-y-auto border rounded-lg p-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
              ) : (
                timeline.map((entry) => (
                  <div key={entry.id} className="flex gap-3 text-sm">
                    <Clock className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-foreground">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), "MMM d, h:mm a")}
                        {entry.profiles?.full_name ? ` · ${entry.profiles.full_name}` : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add comment */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[60px]"
            />
            <Button size="sm" onClick={handleAddComment} disabled={saving || !comment.trim()}>Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateIncidentDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (p: { title: string; severity: string; category: string; description: string; impact: string }) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [category, setCategory] = useState("service_outage");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), severity, category, description: description.trim(), impact: impact.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report New Incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief description of the incident..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{categoryLabel(c as Incident["category"])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened?" className="min-h-[80px]" />
          </div>
          <div>
            <Label>Impact</Label>
            <Textarea value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="What is the business/regulatory impact?" className="min-h-[60px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim()}>
            {isPending ? "Creating..." : "Create Incident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}