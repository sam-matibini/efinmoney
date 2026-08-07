import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GraduationCap, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  courseState, isRequiredFor, requirementOf, requirementLabel,
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

  const rows = useMemo(() => {
    return (courses as Any[])
      .map((c) => {
        const required = isRequiredFor(c, role) || assignedIds.has(c.id);
        const rec = latestFor(c.id, c.course_name);
        const state = courseState({
          completedAt: rec?.completed_at,
          expiryDate: rec?.expiry_date,
          onboardingDueDays: required ? c.onboarding_due_days : null,
          activatedAt,
        });
        return { course: c, required, rec, state: state as CellState };
      })
      .filter((r) => r.required || r.rec)
      .sort((a, b) => Number(b.required) - Number(a.required) || a.course.course_name.localeCompare(b.course.course_name));
  }, [courses, records, assignedIds, role, activatedAt]);

  const stats = useMemo(() => {
    const req = rows.filter((r) => r.required);
    return {
      required: req.length,
      current: req.filter((r) => r.state === "current").length,
      attention: req.filter((r) => r.state !== "current").length,
    };
  }, [rows]);

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="w-4 h-4" /> Training & certifications
        </CardTitle>
        {canModify && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLogOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Log completion
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {cLoading || rLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
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
                {rows.map(({ course, required, rec, state }) => (
                  <div key={course.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{course.course_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {required ? requirementLabel(requirementOf(course)) : "Elective"}
                        {rec?.completed_at && ` · Completed ${format(new Date(rec.completed_at), "d MMM yyyy")}`}
                        {rec?.expiry_date && ` · Expires ${format(new Date(rec.expiry_date), "d MMM yyyy")}`}
                        {rec?.score != null && ` · Score ${rec.score}%`}
                      </p>
                    </div>
                    <Badge variant="outline" className={STATE_CLASS[state]}>
                      {required ? STATE_LABEL[state] : rec ? "Completed" : "Optional"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log training completion</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Course</Label>
              <Select value={logForm.course_id} onValueChange={(v) => setLogForm((f) => ({ ...f, course_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a course" /></SelectTrigger>
                <SelectContent>
                  {(courses as Any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.course_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
