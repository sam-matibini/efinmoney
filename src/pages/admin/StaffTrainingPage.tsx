import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { GraduationCap, Plus, CheckCircle2, PlayCircle, BookOpen, Clock, Trophy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function StaffTrainingPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ course_name: "", category: "aml", frequency_months: "12", is_mandatory: false });
  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState({ course_id: "", course_name: "", score: "", staff_id: "" });
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({ course_id: "", staff_id: "all", due: "" });

  // Learner "Start training" state
  const [learn, setLearn] = useState<Any | null>(null);       // course being taken
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);

  const { data: me } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: courses = [], isLoading: cLoading } = useQuery({
    queryKey: ["training-courses"],
    queryFn: async () => {
      const { data } = await (supabase as Any).from("training_courses").select("*").order("category");
      return data || [];
    },
  });

  const { data: records = [], isLoading: rLoading } = useQuery({
    queryKey: ["training-records"],
    queryFn: async () => {
      const { data } = await (supabase as Any).from("training_records").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["training-assignments"],
    queryFn: async () => {
      const { data } = await (supabase as Any).from("training_assignments").select("*");
      return data || [];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["training-staff"],
    queryFn: async () => {
      const { data } = await (supabase as Any).from("admin_users").select("*");
      return data || [];
    },
  });

  const addCourse = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as Any).from("training_courses").insert({ ...form, frequency_months: Number(form.frequency_months) });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["training-courses"] }); setShowAdd(false); setForm({ course_name: "", category: "aml", frequency_months: "12", is_mandatory: false }); toast.success("Course added"); },
    onError: () => toast.error("Failed to add course"),
  });

  const setMandatory = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await (supabase as Any).from("training_courses").update({ is_mandatory: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["training-courses"] }); toast.success("Course updated"); },
    onError: () => toast.error("Failed to update course"),
  });

  const logCompletion = useMutation({
    mutationFn: async () => {
      const score = logForm.score ? Number(logForm.score) : null;
      const course = courses.find((c: Any) => c.id === logForm.course_id);
      const months = Number(course?.frequency_months) || 12;
      const passMark = Number(course?.pass_mark) || 70;
      const expiry = new Date(); expiry.setMonth(expiry.getMonth() + months);
      const staffId = logForm.staff_id || me?.id;
      const { error } = await (supabase as Any).from("training_records").insert({ staff_id: staffId, course_id: logForm.course_id || null, course_name: logForm.course_name, completed_at: new Date().toISOString(), score, passed: score == null || score >= passMark, expiry_date: expiry.toISOString().split("T")[0] });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["training-records"] }); setShowLog(false); setLogForm({ course_id: "", course_name: "", score: "", staff_id: "" }); toast.success("Completion logged"); },
    onError: () => toast.error("Failed to log completion"),
  });

  const assign = useMutation({
    mutationFn: async () => {
      const targets = assignForm.staff_id === "all" ? staffRows.map((s) => s.id) : [assignForm.staff_id];
      const due = assignForm.due || null;
      const rows = targets.filter(Boolean).map((sid) => ({ staff_id: sid, course_id: assignForm.course_id, expected_completion_date: due, status: "assigned" }));
      const { error } = await (supabase as Any).from("training_assignments").upsert(rows, { onConflict: "staff_id,course_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["training-assignments"] }); setShowAssign(false); setAssignForm({ course_id: "", staff_id: "all", due: "" }); toast.success("Course assigned"); },
    onError: () => toast.error("Failed to assign course"),
  });

  // Learner submits the quiz → auto-score, record completion, update assignment.
  const submitQuiz = useMutation({
    mutationFn: async () => {
      if (!learn || !me?.id) throw new Error("no session");
      const quiz: Any[] = Array.isArray(learn.quiz) ? learn.quiz : [];
      const total = quiz.length || 1;
      const correct = quiz.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
      const score = Math.round((correct / total) * 100);
      const passMark = Number(learn.pass_mark) || 70;
      const passed = score >= passMark;
      const months = Number(learn.frequency_months) || 12;
      const expiry = new Date(); expiry.setMonth(expiry.getMonth() + months);

      const { error: recErr } = await (supabase as Any).from("training_records").insert({
        staff_id: me.id, course_id: learn.id, course_name: learn.course_name,
        completed_at: new Date().toISOString(), score, passed,
        expiry_date: expiry.toISOString().split("T")[0],
      });
      if (recErr) throw recErr;

      await (supabase as Any).from("training_assignments").upsert(
        { staff_id: me.id, course_id: learn.id, status: passed ? "completed" : "in_progress", completed_at: passed ? new Date().toISOString() : null },
        { onConflict: "staff_id,course_id" }
      );

      return { score, passed };
    },
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ["training-records"] }); qc.invalidateQueries({ queryKey: ["training-assignments"] }); },
    onError: () => toast.error("Could not submit quiz"),
  });

  const openCourse = (course: Any) => {
    setLearn(course); setAnswers({}); setResult(null);
    if (me?.id) {
      (supabase as Any).from("training_assignments").upsert(
        { staff_id: me.id, course_id: course.id, status: "in_progress" },
        { onConflict: "staff_id,course_id", ignoreDuplicates: false }
      ).then(() => qc.invalidateQueries({ queryKey: ["training-assignments"] }));
    }
  };

  const expired = records.filter((r: Any) => r.expiry_date && isPast(new Date(r.expiry_date))).length;

  const mandatory = courses.filter((c: Any) => c.is_mandatory);
  const staffRows = staff.length
    ? staff.map((s: Any) => ({ id: s.user_id || s.id, name: s.full_name || s.email || s.user_id || s.id }))
    : Array.from(new Set(records.map((r: Any) => r.staff_id).filter(Boolean))).map((id: Any) => ({ id, name: id as string }));

  const cellStatus = (staffId: string, course: Any) => {
    const hits = records.filter((r: Any) => r.staff_id === staffId && (r.course_id === course.id || r.course_name === course.course_name) && r.passed);
    if (!hits.length) return "missing";
    const newest = hits.reduce((a: Any, b: Any) => (new Date(a.completed_at) > new Date(b.completed_at) ? a : b));
    if (newest.expiry_date && isPast(new Date(newest.expiry_date))) return "expired";
    return "current";
  };

  const statusBadge = (s: string) =>
    s === "current" ? <Badge className="bg-emerald-500/10 text-emerald-600">Current</Badge>
      : s === "expired" ? <Badge className="bg-amber-500/10 text-amber-600">Expired</Badge>
      : <Badge className="bg-red-500/10 text-red-600">Missing</Badge>;

  const gaps = staffRows.reduce((n, s) => n + mandatory.filter((c: Any) => cellStatus(s.id, c) !== "current").length, 0);

  // Per-course completion rate across all staff (passing, non-expired record).
  const completionRate = (course: Any) => {
    if (!staffRows.length) return 0;
    const done = staffRows.filter((s) => cellStatus(s.id, course) === "current").length;
    return Math.round((done / staffRows.length) * 100);
  };
  const overallRate = mandatory.length && staffRows.length
    ? Math.round(mandatory.reduce((sum: number, c: Any) => sum + completionRate(c), 0) / mandatory.length)
    : 0;

  // ---- Learner view helpers (current user) ----
  const myId = me?.id;
  const myAssignmentFor = (courseId: string) => assignments.find((a: Any) => a.staff_id === myId && a.course_id === courseId);
  const myStatus = (course: Any): "current" | "expired" | "missing" => (myId ? cellStatus(myId, course) : "missing") as Any;
  const myRecords = records.filter((r: Any) => r.staff_id === myId);
  const myCompleted = mandatory.filter((c: Any) => myStatus(c) === "current").length;

  const answeredAll = learn && Array.isArray(learn.quiz) && learn.quiz.length > 0
    ? learn.quiz.every((_: Any, i: number) => answers[i] != null)
    : false;

  return (
    <AdminLayout>
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Staff Training</h1><p className="text-muted-foreground">RPAA online learning — study materials, assessments and completion tracking</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowLog(true)}><CheckCircle2 className="w-4 h-4 mr-1" />Log Completion</Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Course</Button>
        </div>
      </div>

      <Tabs defaultValue="learn" className="space-y-6">
        <TabsList>
          <TabsTrigger value="learn"><BookOpen className="w-4 h-4 mr-1" />My Training</TabsTrigger>
          <TabsTrigger value="manage"><GraduationCap className="w-4 h-4 mr-1" />Manage</TabsTrigger>
        </TabsList>

        {/* ------------------------------- LEARNER ------------------------------- */}
        <TabsContent value="learn" className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-3">
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{mandatory.length}</div><div className="text-xs text-muted-foreground">Assigned courses</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{myCompleted}</div><div className="text-xs text-muted-foreground">Completed</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{mandatory.length - myCompleted}</div><div className="text-xs text-muted-foreground">Outstanding</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>My Courses</CardTitle></CardHeader>
            <CardContent>
              {cLoading ? <Skeleton className="h-24 w-full" /> : mandatory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No training assigned yet.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Program area</TableHead><TableHead>Duration</TableHead><TableHead>Pass mark</TableHead><TableHead>Due by</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {mandatory.map((c: Any) => {
                      const st = myStatus(c);
                      const a = myAssignmentFor(c.id);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.course_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.program_area || c.category}</TableCell>
                          <TableCell className="text-xs"><Clock className="w-3 h-3 inline mr-1" />{c.estimated_minutes ?? 30} min</TableCell>
                          <TableCell className="font-mono">{c.pass_mark ?? 70}%</TableCell>
                          <TableCell className="text-xs">{a?.expected_completion_date ? format(new Date(a.expected_completion_date), "MMM d, yyyy") : "—"}</TableCell>
                          <TableCell>{st === "current" ? <Badge className="bg-emerald-500/10 text-emerald-600">Completed</Badge> : st === "expired" ? <Badge className="bg-amber-500/10 text-amber-600">Renewal due</Badge> : <Badge className="bg-muted">Not started</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant={st === "current" ? "outline" : "default"} onClick={() => openCourse(c)}>
                              <PlayCircle className="w-4 h-4 mr-1" />{st === "current" ? "Retake" : "Start training"}
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
            <CardHeader><CardTitle>My Completion History</CardTitle></CardHeader>
            <CardContent>
              {rLoading ? <Skeleton className="h-16 w-full" /> : myRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completions yet — start a course above.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Score</TableHead><TableHead>Result</TableHead><TableHead>Completed</TableHead><TableHead>Expires</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {myRecords.map((r: Any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.course_name || "—"}</TableCell>
                        <TableCell className="font-mono">{r.score != null ? `${r.score}%` : "—"}</TableCell>
                        <TableCell>{r.passed ? <Badge className="bg-emerald-500/10 text-emerald-600">Passed</Badge> : <Badge className="bg-red-500/10 text-red-600">Failed</Badge>}</TableCell>
                        <TableCell className="text-xs">{r.completed_at ? format(new Date(r.completed_at), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell className="text-xs">{r.expiry_date ? format(new Date(r.expiry_date), "MMM d, yyyy") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------- ADMIN ------------------------------- */}
        <TabsContent value="manage" className="space-y-6">
          <div className="grid sm:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{courses.length}</div><div className="text-xs text-muted-foreground">Courses ({mandatory.length} mandatory)</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{records.length}</div><div className="text-xs text-muted-foreground">Completions</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{expired}</div><div className="text-xs text-muted-foreground">Expired certs</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><div className={`text-2xl font-bold ${overallRate >= 100 ? "text-emerald-500" : "text-amber-500"}`}>{overallRate}%</div><div className="text-xs text-muted-foreground">Overall completion</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Trophy className="w-5 h-5" />Completion Rate by Course</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}><Plus className="w-4 h-4 mr-1" />Assign</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {mandatory.length === 0 || staffRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add mandatory courses and staff to see completion rates.</p>
              ) : mandatory.map((c: Any) => {
                const rate = completionRate(c);
                return (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm"><span className="font-medium">{c.course_name}</span><span className="font-mono text-muted-foreground">{rate}%</span></div>
                    <Progress value={rate} className="h-2" />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="w-5 h-5" />Course Catalogue</CardTitle></CardHeader>
            <CardContent>
              {cLoading ? <Skeleton className="h-24 w-full" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Program area</TableHead><TableHead>Mandatory</TableHead><TableHead>Pass mark</TableHead><TableHead>Content</TableHead><TableHead>Frequency</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {courses.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No courses. Add your first course above.</TableCell></TableRow> : courses.map((c: Any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.course_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.program_area || c.category}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch checked={!!c.is_mandatory} onCheckedChange={(v) => setMandatory.mutate({ id: c.id, value: v })} />
                            {c.is_mandatory ? <Badge className="bg-red-500/10 text-red-600">Mandatory</Badge> : <Badge className="bg-muted">Optional</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{c.pass_mark ?? 70}%</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{(Array.isArray(c.study_materials) ? c.study_materials.length : 0)} lessons · {(Array.isArray(c.quiz) ? c.quiz.length : 0)} questions</TableCell>
                        <TableCell>Every {c.frequency_months} months</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Mandatory Training Compliance Matrix</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {mandatory.length === 0 || staffRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add mandatory courses and staff records to see the matrix.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      {mandatory.map((c: Any) => <TableHead key={c.id}>{c.course_name}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffRows.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        {mandatory.map((c: Any) => <TableCell key={c.id}>{statusBadge(cellStatus(s.id, c))}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Completion Records</CardTitle></CardHeader>
            <CardContent>
              {rLoading ? <Skeleton className="h-24 w-full" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Score</TableHead><TableHead>Result</TableHead><TableHead>Completed</TableHead><TableHead>Expires</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {records.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No completions logged.</TableCell></TableRow> : records.map((r: Any) => {
                      const isExpired = r.expiry_date && isPast(new Date(r.expiry_date));
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.course_name || "—"}</TableCell>
                          <TableCell className="font-mono">{r.score != null ? `${r.score}%` : "—"}</TableCell>
                          <TableCell>{r.passed ? <Badge className="bg-emerald-500/10 text-emerald-600">Passed</Badge> : <Badge className="bg-red-500/10 text-red-600">Failed</Badge>}</TableCell>
                          <TableCell className="text-xs">{r.completed_at ? format(new Date(r.completed_at), "MMM d, yyyy") : "—"}</TableCell>
                          <TableCell className="text-xs">{r.expiry_date ? <span className={isExpired ? "text-red-500 font-bold" : ""}>{format(new Date(r.expiry_date), "MMM d, yyyy")}</span> : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------------------------- Start training modal ---------------------------- */}
      <Dialog open={!!learn} onOpenChange={(o) => { if (!o) { setLearn(null); setResult(null); setAnswers({}); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{learn?.course_name}</DialogTitle>
            <DialogDescription>{learn?.description || "Complete the study materials, then pass the assessment to finish."}</DialogDescription>
          </DialogHeader>

          {learn && !result && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span><Clock className="w-3 h-3 inline mr-1" />{learn.estimated_minutes ?? 30} min</span>
                <span>Pass mark {learn.pass_mark ?? 70}%</span>
                <span>{Array.isArray(learn.quiz) ? learn.quiz.length : 0} questions</span>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4" />Study materials</h3>
                {(Array.isArray(learn.study_materials) ? learn.study_materials : []).map((m: Any, i: number) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="font-medium text-sm">{m.title}</div>
                    <p className="text-sm text-muted-foreground mt-1">{m.body}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-5">
                <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Assessment</h3>
                {(Array.isArray(learn.quiz) ? learn.quiz : []).map((q: Any, qi: number) => (
                  <div key={qi} className="space-y-2">
                    <div className="text-sm font-medium">{qi + 1}. {q.question}</div>
                    <RadioGroup value={answers[qi]?.toString() ?? ""} onValueChange={(v) => setAnswers({ ...answers, [qi]: Number(v) })}>
                      {(q.options || []).map((opt: string, oi: number) => (
                        <div key={oi} className="flex items-center gap-2">
                          <RadioGroupItem value={oi.toString()} id={`q${qi}-o${oi}`} />
                          <Label htmlFor={`q${qi}-o${oi}`} className="cursor-pointer font-normal">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="py-6 text-center space-y-3">
              <div className={`text-5xl font-bold ${result.passed ? "text-emerald-500" : "text-red-500"}`}>{result.score}%</div>
              {result.passed
                ? <p className="text-emerald-600 font-medium">Passed — your completion has been recorded.</p>
                : <p className="text-red-600 font-medium">Below the {learn?.pass_mark ?? 70}% pass mark. Review the materials and retake.</p>}
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button onClick={() => { setLearn(null); setResult(null); setAnswers({}); }}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setLearn(null)}>Cancel</Button>
                <Button onClick={() => submitQuiz.mutate()} disabled={!answeredAll || submitQuiz.isPending}>{submitQuiz.isPending ? "Submitting..." : "Submit assessment"}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------- Add course ---------------------------- */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Training Course</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Course Name</Label><Input value={form.course_name} onChange={(e) => setForm({ ...form, course_name: e.target.value })} placeholder="e.g., AML Fundamentals" /></div>
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aml">AML</SelectItem><SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="sanctions">Sanctions</SelectItem><SelectItem value="data_privacy">Data Privacy</SelectItem>
                  <SelectItem value="fraud">Fraud</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Frequency (months)</Label><Input value={form.frequency_months} onChange={(e) => setForm({ ...form, frequency_months: e.target.value })} type="number" /></div>
            <div className="flex items-center gap-3 pt-1">
              <Switch id="mandatory-toggle" checked={form.is_mandatory} onCheckedChange={(v) => setForm({ ...form, is_mandatory: v })} />
              <Label htmlFor="mandatory-toggle" className="cursor-pointer">Mandatory for all staff</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addCourse.mutate()} disabled={addCourse.isPending || !form.course_name}>{addCourse.isPending ? "Adding..." : "Add Course"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------- Assign course ---------------------------- */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Training</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Course</Label>
              <Select value={assignForm.course_id} onValueChange={(v) => setAssignForm({ ...assignForm, course_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>{courses.map((c: Any) => <SelectItem key={c.id} value={c.id}>{c.course_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Staff member</Label>
              <Select value={assignForm.staff_id} onValueChange={(v) => setAssignForm({ ...assignForm, staff_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {staffRows.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Expected completion date</Label><Input type="date" value={assignForm.due} onChange={(e) => setAssignForm({ ...assignForm, due: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button onClick={() => assign.mutate()} disabled={assign.isPending || !assignForm.course_id}>{assign.isPending ? "Assigning..." : "Assign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------- Log completion ---------------------------- */}
      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Training Completion</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Course</Label>
              <Select value={logForm.course_id} onValueChange={(v) => { const c = courses.find((c: Any) => c.id === v); setLogForm({ ...logForm, course_id: v, course_name: c?.course_name || "" }); }}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>{courses.map((c: Any) => <SelectItem key={c.id} value={c.id}>{c.course_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {staffRows.length > 0 && (
              <div><Label>Staff member</Label>
                <Select value={logForm.staff_id} onValueChange={(v) => setLogForm({ ...logForm, staff_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Myself" /></SelectTrigger>
                  <SelectContent>{staffRows.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Score (%)</Label><Input value={logForm.score} onChange={(e) => setLogForm({ ...logForm, score: e.target.value })} type="number" placeholder="e.g., 85" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLog(false)}>Cancel</Button>
            <Button onClick={() => logCompletion.mutate()} disabled={logCompletion.isPending || !logForm.course_id}>{logCompletion.isPending ? "Logging..." : "Log Completion"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
