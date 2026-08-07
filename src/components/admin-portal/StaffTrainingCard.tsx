import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GraduationCap, Plus, Link2, Check, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  courseState, isRequiredFor, requirementOf, requirementLabel, linkReason, roleLabel,
  STATE_CLASS, STATE_LABEL, type CellState,
} from "@/lib/trainingRequirements";

type Any = any;

interface Props {
  staffId: string;
  role: string | null | undefined;
  /** When the staff member became active — starts the onboarding clock. */
  activatedAt?: string | null;
  canModify?: boolean;
}

const StaffTrainingCard = ({ staffId, role, activatedAt, canModify = true }: Props) => {
  const qc = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [logForm, setLogForm] = useState({ course_id: "", score: "" });

  const { data: courses = [], isLoading: cLoading } = useQuery({
    queryKey: ["training-courses"],
    queryFn: async () => {
      const { data } = await (supabase as Any).from("training_courses").select("*").order("category");
      return data || [];
    },
  });

  const { data: records = [], isLoading: rLoading } = useQuery({
    queryKey: ["training-records", staffId],
    queryFn: async () => {
      const { data } = await (supabase as Any)
        .from("training_records")
        .select("*")
        .eq("staff_id", staffId)
        .order("completed_at", { ascending: false });
      return data || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["training-assignments", staffId],
    queryFn: async () => {
      const { data } = await (supabase as Any).from("training_assignments").select("*").eq("staff_id", staffId);
      return data || [];
    },
  });

  const assignedIds = useMemo(
    () => new Set((assignments as Any[]).map((a) => a.course_id)),
    [assignments],
  );

  const latestFor = (courseId: string, courseName: string) =>
    (records as Any[]).find(
      (r) => r.passed !== false && (r.course_id === courseId || (!r.course_id && r.course_name === courseName)),
    );

  /** Every course, annotated with why it does or doesn't apply to this staff member. */
  const annotated = useMemo(() => {
    return (courses as Any[]).map((c) => {
      const assigned = assignedIds.has(c.id);
      const link = linkReason(c, role, assigned);
      const rec = latestFor(c.id, c.course_name);
      const state = courseState({
        completedAt: rec?.completed_at,
        expiryDate: rec?.expiry_date,
        onboardingDueDays: link.required ? c.onboarding_due_days : null,
        activatedAt,
      }) as CellState;
      return { course: c, assigned, link, rec, state };
    });
  }, [courses, records, assignedIds, role, activatedAt]);

  const rows = useMemo(
    () =>
      annotated
        .filter((r) => r.link.required || r.rec)
        .sort(
          (a, b) =>
            Number(b.link.required) - Number(a.link.required) ||
            a.course.course_name.localeCompare(b.course.course_name),
        ),
    [annotated],
  );

  const stats = useMemo(() => {
    const req = rows.filter((r) => r.link.required);
    return {
      required: req.length,
      current: req.filter((r) => r.state === "current").length,
      attention: req.filter((r) => r.state !== "current").length,
    };
  }, [rows]);

  /** Grouped options for the "log completion" picker — required first, with status hints. */
  const logGroups = useMemo(() => {
    const auto = annotated.filter((r) => r.link.required && r.link.source !== "assigned");
    const linked = annotated.filter((r) => r.link.source === "assigned");
    const other = annotated.filter((r) => !r.link.required);
    return [
      { label: `Required for ${roleLabel(role)}`, items: auto },
      { label: "Manually linked", items: linked },
      { label: "Not required for this role", items: other },
    ].filter((g) => g.items.length > 0);
  }, [annotated, role]);

  const linkable = useMemo(
    () => annotated.filter((r) => r.link.source !== "all_staff" && r.link.source !== "role"),
    [annotated],
  );

  const toggleLink = useMutation({
    mutationFn: async ({ courseId, on }: { courseId: string; on: boolean }) => {
      if (on) {
        const { error } = await (supabase as Any)
          .from("training_assignments")
          .upsert({ staff_id: staffId, course_id: courseId }, { onConflict: "staff_id,course_id" });
        if (error) throw error;
      } else {
        const { error } = await (supabase as Any)
          .from("training_assignments")
          .delete()
          .eq("staff_id", staffId)
          .eq("course_id", courseId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-assignments", staffId] }),
    onError: (e: Any) => toast.error(e?.message || "Failed to update link"),
  });

  const logCompletion = useMutation({
    mutationFn: async () => {
      const course = (courses as Any[]).find((c) => c.id === logForm.course_id);
      if (!course) throw new Error("Pick a course");
      const score = logForm.score ? Number(logForm.score) : null;
      const passMark = Number(course.pass_mark) || 70;
      const months = Number(course.frequency_months) || 12;
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + months);
      const { error } = await (supabase as Any).from("training_records").insert({
        staff_id: staffId,
        course_id: course.id,
        course_name: course.course_name,
        completed_at: new Date().toISOString(),
        score,
        passed: score == null || score >= passMark,
        expiry_date: expiry.toISOString().split("T")[0],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-records", staffId] });
      qc.invalidateQueries({ queryKey: ["training-records"] });
      setLogOpen(false);
      setLogForm({ course_id: "", score: "" });
      toast.success("Completion logged");
    },
    onError: (e: Any) => toast.error(e?.message || "Failed to log completion"),
  });

  const selected = annotated.find((r) => r.course.id === logForm.course_id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="w-4 h-4" /> Training & certifications
        </CardTitle>
        {canModify && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLinkOpen(true)}>
              <Link2 className="w-3.5 h-3.5" /> Link courses
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLogOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Log completion
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {cLoading || rLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Curriculum resolved from role <span className="font-medium text-foreground">{roleLabel(role)}</span> —
              all-staff courses plus role-specific ones are linked automatically.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Required", value: stats.required },
                { label: "Current", value: stats.current },
                { label: "Needs action", value: stats.attention },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-semibold">{s.value}</p>
                </div>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses apply to this role yet.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {rows.map(({ course, link, rec, state }) => (
                  <div key={course.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{course.course_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {link.required ? link.reason : "Elective"}
                        {rec?.completed_at && ` · Completed ${format(new Date(rec.completed_at), "d MMM yyyy")}`}
                        {rec?.expiry_date && ` · Expires ${format(new Date(rec.expiry_date), "d MMM yyyy")}`}
                        {rec?.score != null && ` · Score ${rec.score}%`}
                      </p>
                    </div>
                    <Badge variant="outline" className={STATE_CLASS[state]}>
                      {link.required ? STATE_LABEL[state] : rec ? "Completed" : "Optional"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Smart linking */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link courses — {roleLabel(role)}</DialogTitle>
            <DialogDescription>
              Mandatory and role-based courses are already linked automatically. Only add extras here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[55vh] overflow-y-auto">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Auto-linked by role ({annotated.filter((r) => r.link.source === "all_staff" || r.link.source === "role").length})
              </p>
              <div className="divide-y rounded-lg border">
                {annotated
                  .filter((r) => r.link.source === "all_staff" || r.link.source === "role")
                  .map(({ course, link }) => (
                    <div key={course.id} className="flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{course.course_name}</p>
                        <p className="text-xs text-muted-foreground">{link.reason}</p>
                      </div>
                      <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600">
                        <Check className="w-3 h-3" /> Linked
                      </Badge>
                    </div>
                  ))}
                {annotated.filter((r) => r.link.source === "all_staff" || r.link.source === "role").length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No courses map to this role yet.</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Available to link ({linkable.length})</p>
              <div className="divide-y rounded-lg border">
                {linkable.map(({ course, assigned, link }) => (
                  <div key={course.id} className="flex items-center justify-between gap-2 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{course.course_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {requirementLabel(requirementOf(course))} · {link.reason}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={assigned ? "outline" : "secondary"}
                      className="gap-1 shrink-0"
                      disabled={toggleLink.isPending}
                      onClick={() => toggleLink.mutate({ courseId: course.id, on: !assigned })}
                    >
                      {assigned ? <><X className="w-3 h-3" /> Unlink</> : <><Link2 className="w-3 h-3" /> Link</>}
                    </Button>
                  </div>
                ))}
                {linkable.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">Every course is already required for this role.</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setLinkOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log training completion</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Course</Label>
              <Select value={logForm.course_id} onValueChange={(v) => setLogForm((f) => ({ ...f, course_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a course" /></SelectTrigger>
                <SelectContent>
                  {logGroups.map((g) => (
                    <SelectGroup key={g.label}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.items.map(({ course, state, link }) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.course_name}
                          {link.required ? ` — ${STATE_LABEL[state]}` : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {selected && <p className="text-xs text-muted-foreground">{selected.link.reason}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Score (%)</Label>
              <Input
                type="number" min={0} max={100} placeholder="Optional"
                value={logForm.score}
                onChange={(e) => setLogForm((f) => ({ ...f, score: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button disabled={!logForm.course_id || logCompletion.isPending} onClick={() => logCompletion.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default StaffTrainingCard;
