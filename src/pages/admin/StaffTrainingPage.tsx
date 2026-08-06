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
import { GraduationCap, Plus, CheckCircle2, PlayCircle, BookOpen, Clock, Trophy, ExternalLink, Download, FileText, Trash2, ArrowUp, ArrowDown, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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

  // Program filter (shared between learner + manage tabs)
  const [programFilter, setProgramFilter] = useState("all");
  // PDF signed-URL download state
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  // Phase 1B: content authoring state
  const [showEdit, setShowEdit] = useState(false);
  const [editCourse, setEditCourse] = useState<Any | null>(null);
  const [editTab, setEditTab] = useState("meta");
  const [editMeta, setEditMeta] = useState({ course_name: "", program_area: "fintrac_mandatory", role_requirement: "", estimated_minutes: "30", pass_mark: "70", frequency_months: "12", is_mandatory: false });
  const [editLessons, setEditLessons] = useState<Array<{ title: string; body: string }>>([]);
  const [editQuiz, setEditQuiz] = useState<Array<{ question: string; options: string[]; answer: number }>>([]);
  const [editLinks, setEditLinks] = useState<Array<{ label: string; url: string; type: string }>>([]);
  const [newLink, setNewLink] = useState({ label: "", url: "", type: "Official Guidance" });
  const [uploading, setUploading] = useState(false);

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

  const openEdit = (course: Any) => {
    setEditCourse(course);
    setEditMeta({
      course_name: course.course_name || "",
      program_area: course.program_area || "fintrac_mandatory",
      role_requirement: course.role_requirement || "",
      estimated_minutes: String(course.estimated_minutes ?? 30),
      pass_mark: String(course.pass_mark ?? 70),
      frequency_months: String(course.frequency_months ?? 12),
      is_mandatory: !!course.is_mandatory,
    });
    setEditLessons(Array.isArray(course.study_materials) ? JSON.parse(JSON.stringify(course.study_materials)) : []);
    setEditQuiz(Array.isArray(course.quiz) ? JSON.parse(JSON.stringify(course.quiz)) : []);
    setEditLinks(Array.isArray(course.resources) ? JSON.parse(JSON.stringify(course.resources)) : []);
    setNewLink({ label: "", url: "", type: "Official Guidance" });
    setEditTab("meta");
    setShowEdit(true);
  };

  const patchCourse = useMutation({
    mutationFn: async (patch: Record<string, Any>) => {
      if (!editCourse) throw new Error("No course selected");
      const { error } = await (supabase as Any).from("training_courses").update(patch).eq("id", editCourse.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      setEditCourse((c: Any) => (c ? { ...c, ...patch } : c));
      qc.invalidateQueries({ queryKey: ["training-courses"] });
      toast.success("Saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  const uploadFile = async (file: File) => {
    if (!editCourse) return;
    setUploading(true);
    try {
      const path = `${editCourse.id}/${file.name}`;
      const { error: upErr } = await (supabase as Any).storage.from("training-materials").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const existing: Any[] = Array.isArray(editCourse.attachments) ? editCourse.attachments : [];
      const updated = [...existing.filter((a: Any) => a.path !== path), { name: file.name, path, size_label: `${(file.size / 1024).toFixed(0)} KB`, mime: file.type }];
      const { error: dbErr } = await (supabase as Any).from("training_courses").update({ attachments: updated }).eq("id", editCourse.id);
      if (dbErr) throw dbErr;
      setEditCourse((c: Any) => (c ? { ...c, attachments: updated } : c));
      qc.invalidateQueries({ queryKey: ["training-courses"] });
      toast.success(`${file.name} uploaded`);
    } catch (e: Any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (att: Any) => {
    if (!editCourse) return;
    await (supabase as Any).storage.from("training-materials").remove([att.path]);
    const updated = (Array.isArray(editCourse.attachments) ? editCourse.attachments : []).filter((a: Any) => a.path !== att.path);
    const { error } = await (supabase as Any).from("training_courses").update({ attachments: updated }).eq("id", editCourse.id);
    if (error) { toast.error("Failed to remove file"); return; }
    setEditCourse((c: Any) => (c ? { ...c, attachments: updated } : c));
    qc.invalidateQueries({ queryKey: ["training-courses"] });
    toast.success("File removed");
  };

  const programLabel = (pa: string | undefined) => {
    const map: Record<string, string> = {
      fintrac_mandatory: "FINTRAC Mandatory",
      fintrac_elective: "FINTRAC Elective",
      boc_rpaa_mandatory: "BoC RPAA Mandatory",
      boc_rpaa_elective: "BoC RPAA Elective",
      consulting: "Consulting",
    };
    return pa ? (map[pa] || pa) : "—";
  };

  const downloadAttachment = async (att: Any) => {
    setDownloadingFile(att.path);
    try {
      const { data } = await (supabase as Any).storage.from("training-materials").createSignedUrl(att.path, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      else toast.error("Could not generate download link");
    } finally {
      setDownloadingFile(null);
    }
  };

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
  const hasContent = (c: Any) => Array.isArray(c.quiz) && c.quiz.length > 0;
  const learnable = courses.filter(hasContent); // all courses with content (mandatory + elective)

  const matchesProgram = (c: Any) => {
    if (programFilter === "all") return true;
    if (programFilter === "fintrac") return c.program_area?.startsWith("fintrac");
    if (programFilter === "boc_rpaa") return c.program_area?.startsWith("boc_rpaa");
    return c.program_area === programFilter;
  };
  const learnableFiltered = learnable.filter(matchesProgram);
  const catalogueFiltered = courses.filter(matchesProgram);
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
  const myCompleted = learnable.filter((c: Any) => myStatus(c) === "current").length;

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
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{learnable.length}</div><div className="text-xs text-muted-foreground">Assigned courses</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-emerald-500">{myCompleted}</div><div className="text-xs text-muted-foreground">Completed</div></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{learnable.length - myCompleted}</div><div className="text-xs text-muted-foreground">Outstanding</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>My Courses</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {(["all","fintrac","boc_rpaa","consulting"] as const).map((key) => (
                  <Button key={key} size="sm" variant={programFilter === key ? "default" : "outline"} onClick={() => setProgramFilter(key)}>
                    {key === "all" ? "All" : key === "fintrac" ? "FINTRAC" : key === "boc_rpaa" ? "BoC RPAA" : "Consulting"}
                  </Button>
                ))}
              </div>
              {cLoading ? <Skeleton className="h-24 w-full" /> : learnableFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">No courses in this program area yet.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Program area</TableHead><TableHead>Duration</TableHead><TableHead>Pass mark</TableHead><TableHead>Due by</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {learnableFiltered.map((c: Any) => {
                      const st = myStatus(c);
                      const a = myAssignmentFor(c.id);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.course_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{programLabel(c.program_area) || c.category}</TableCell>
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
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {(["all","fintrac","boc_rpaa","consulting"] as const).map((key) => (
                  <Button key={key} size="sm" variant={programFilter === key ? "default" : "outline"} onClick={() => setProgramFilter(key)}>
                    {key === "all" ? "All" : key === "fintrac" ? "FINTRAC" : key === "boc_rpaa" ? "BoC RPAA" : "Consulting"}
                  </Button>
                ))}
              </div>
              {cLoading ? <Skeleton className="h-24 w-full" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Program area</TableHead><TableHead>Mandatory</TableHead><TableHead>Pass mark</TableHead><TableHead>Content</TableHead><TableHead>Frequency</TableHead><TableHead className="text-right">Edit</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {catalogueFiltered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No courses in this program area.</TableCell></TableRow> : catalogueFiltered.map((c: Any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.course_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{programLabel(c.program_area) || c.category}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch checked={!!c.is_mandatory} onCheckedChange={(v) => setMandatory.mutate({ id: c.id, value: v })} />
                            {c.is_mandatory ? <Badge className="bg-red-500/10 text-red-600">Mandatory</Badge> : <Badge className="bg-muted">Optional</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{c.pass_mark ?? 70}%</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{(Array.isArray(c.study_materials) ? c.study_materials.length : 0)} lessons · {(Array.isArray(c.quiz) ? c.quiz.length : 0)} questions</TableCell>
                        <TableCell>Every {c.frequency_months} months</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                            <Pencil className="w-3 h-3 mr-1" />Edit
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

              {Array.isArray(learn.resources) && learn.resources.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2 text-sm"><ExternalLink className="w-4 h-4" />Official references</h3>
                  <div className="rounded-lg border p-3 space-y-2">
                    {learn.resources.map((r: Any, i: number) => (
                      <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="flex-1 min-w-0 truncate">{r.label}</span>
                        {r.type && <Badge variant="outline" className="text-[10px] py-0 shrink-0">{r.type}</Badge>}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(learn.attachments) && learn.attachments.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2 text-sm"><Download className="w-4 h-4" />Course materials</h3>
                  <div className="rounded-lg border p-3 space-y-2">
                    {learn.attachments.map((att: Any, i: number) => (
                      <button key={i} onClick={() => downloadAttachment(att)} disabled={downloadingFile === att.path}
                        className="flex items-center gap-2 text-sm text-blue-600 hover:underline w-full text-left disabled:opacity-50">
                        <FileText className="w-3 h-3 flex-shrink-0" />
                        <span className="flex-1 min-w-0 truncate">{att.name}</span>
                        {att.size_label && <span className="text-muted-foreground text-xs shrink-0">({att.size_label})</span>}
                        {downloadingFile === att.path && <span className="text-xs text-muted-foreground shrink-0">Generating link…</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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

      {/* ========================== AUTHORING DIALOG ========================== */}
      <Dialog open={showEdit} onOpenChange={(o) => { if (!o) { setShowEdit(false); setEditCourse(null); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4" />Edit — {editCourse?.course_name}</DialogTitle>
            <DialogDescription>Update metadata, study lessons, quiz questions, uploaded files, and reference links.</DialogDescription>
          </DialogHeader>

          {editCourse && (
            <Tabs value={editTab} onValueChange={setEditTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="meta">Metadata</TabsTrigger>
                <TabsTrigger value="lessons">Lessons <Badge variant="outline" className="ml-1 text-[10px] py-0">{editLessons.length}</Badge></TabsTrigger>
                <TabsTrigger value="quiz">Quiz <Badge variant="outline" className="ml-1 text-[10px] py-0">{editQuiz.length}</Badge></TabsTrigger>
                <TabsTrigger value="files">Files <Badge variant="outline" className="ml-1 text-[10px] py-0">{Array.isArray(editCourse.attachments) ? editCourse.attachments.length : 0}</Badge></TabsTrigger>
                <TabsTrigger value="links">Links <Badge variant="outline" className="ml-1 text-[10px] py-0">{editLinks.length}</Badge></TabsTrigger>
              </TabsList>

              {/* ---------- Metadata ---------- */}
              <TabsContent value="meta" className="space-y-4 pt-4">
                <div><Label>Course name</Label><Input value={editMeta.course_name} onChange={(e) => setEditMeta({ ...editMeta, course_name: e.target.value })} /></div>
                <div><Label>Program area</Label>
                  <Select value={editMeta.program_area} onValueChange={(v) => setEditMeta({ ...editMeta, program_area: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fintrac_mandatory">FINTRAC Mandatory</SelectItem>
                      <SelectItem value="fintrac_elective">FINTRAC Elective</SelectItem>
                      <SelectItem value="boc_rpaa_mandatory">BoC RPAA Mandatory</SelectItem>
                      <SelectItem value="boc_rpaa_elective">BoC RPAA Elective</SelectItem>
                      <SelectItem value="consulting">Consulting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Role requirement</Label><Input value={editMeta.role_requirement} onChange={(e) => setEditMeta({ ...editMeta, role_requirement: e.target.value })} placeholder="e.g., All staff" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Est. minutes</Label><Input type="number" value={editMeta.estimated_minutes} onChange={(e) => setEditMeta({ ...editMeta, estimated_minutes: e.target.value })} /></div>
                  <div><Label>Pass mark (%)</Label><Input type="number" value={editMeta.pass_mark} onChange={(e) => setEditMeta({ ...editMeta, pass_mark: e.target.value })} /></div>
                  <div><Label>Frequency (months)</Label><Input type="number" value={editMeta.frequency_months} onChange={(e) => setEditMeta({ ...editMeta, frequency_months: e.target.value })} /></div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="edit-mandatory" checked={editMeta.is_mandatory} onCheckedChange={(v) => setEditMeta({ ...editMeta, is_mandatory: v })} />
                  <Label htmlFor="edit-mandatory" className="cursor-pointer">Mandatory for all staff</Label>
                </div>
                <Button onClick={() => patchCourse.mutate({ course_name: editMeta.course_name, program_area: editMeta.program_area, role_requirement: editMeta.role_requirement || null, estimated_minutes: Number(editMeta.estimated_minutes), pass_mark: Number(editMeta.pass_mark), frequency_months: Number(editMeta.frequency_months), is_mandatory: editMeta.is_mandatory })} disabled={patchCourse.isPending || !editMeta.course_name}>
                  {patchCourse.isPending ? "Saving…" : "Save metadata"}
                </Button>
              </TabsContent>

              {/* ---------- Lessons ---------- */}
              <TabsContent value="lessons" className="space-y-4 pt-4">
                {editLessons.length === 0 && <p className="text-sm text-muted-foreground">No lessons yet — add the first one below.</p>}
                {editLessons.map((lsn, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-6">#{i + 1}</span>
                      <Input className="flex-1" placeholder="Lesson title" value={lsn.title}
                        onChange={(e) => { const u = [...editLessons]; u[i] = { ...lsn, title: e.target.value }; setEditLessons(u); }} />
                      <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => { const u = [...editLessons]; [u[i - 1], u[i]] = [u[i], u[i - 1]]; setEditLessons(u); }}><ArrowUp className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" disabled={i === editLessons.length - 1} onClick={() => { const u = [...editLessons]; [u[i + 1], u[i]] = [u[i], u[i + 1]]; setEditLessons(u); }}><ArrowDown className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditLessons(editLessons.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                    </div>
                    <Textarea placeholder="Lesson body — paste the study content here" value={lsn.body} rows={5}
                      onChange={(e) => { const u = [...editLessons]; u[i] = { ...lsn, body: e.target.value }; setEditLessons(u); }} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditLessons([...editLessons, { title: "", body: "" }])}><Plus className="w-4 h-4 mr-1" />Add lesson</Button>
                  <Button onClick={() => patchCourse.mutate({ study_materials: editLessons })} disabled={patchCourse.isPending}>
                    {patchCourse.isPending ? "Saving…" : "Save lessons"}
                  </Button>
                </div>
              </TabsContent>

              {/* ---------- Quiz ---------- */}
              <TabsContent value="quiz" className="space-y-4 pt-4">
                <div className="flex items-center gap-3 pb-2 border-b">
                  <Label className="shrink-0">Pass mark (%)</Label>
                  <Input type="number" className="w-24" value={editMeta.pass_mark} onChange={(e) => setEditMeta({ ...editMeta, pass_mark: e.target.value })} />
                  <span className="text-xs text-muted-foreground">Shared with Metadata tab</span>
                </div>
                {editQuiz.length === 0 && <p className="text-sm text-muted-foreground">No questions yet — add the first one below.</p>}
                {editQuiz.map((q, qi) => (
                  <div key={qi} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-7 pt-2">Q{qi + 1}</span>
                      <Textarea className="flex-1" placeholder="Question text" value={q.question} rows={2}
                        onChange={(e) => { const u = [...editQuiz]; u[qi] = { ...q, question: e.target.value }; setEditQuiz(u); }} />
                      <Button size="icon" variant="ghost" onClick={() => setEditQuiz(editQuiz.filter((_, j) => j !== qi))}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                    </div>
                    <p className="text-xs text-muted-foreground pl-9">Click the radio button next to the correct answer.</p>
                    <RadioGroup value={q.answer.toString()} onValueChange={(v) => { const u = [...editQuiz]; u[qi] = { ...q, answer: Number(v) }; setEditQuiz(u); }}
                      className="pl-9 grid grid-cols-2 gap-2">
                      {[0, 1, 2, 3].map((oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <RadioGroupItem value={oi.toString()} id={`eq${qi}-o${oi}`} />
                          <Input placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            value={q.options?.[oi] ?? ""}
                            onChange={(e) => { const u = [...editQuiz]; const opts = [...(q.options ?? ["", "", "", ""])]; opts[oi] = e.target.value; u[qi] = { ...q, options: opts }; setEditQuiz(u); }} />
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditQuiz([...editQuiz, { question: "", options: ["", "", "", ""], answer: 0 }])}><Plus className="w-4 h-4 mr-1" />Add question</Button>
                  <Button onClick={() => patchCourse.mutate({ quiz: editQuiz, pass_mark: Number(editMeta.pass_mark) })} disabled={patchCourse.isPending}>
                    {patchCourse.isPending ? "Saving…" : "Save quiz"}
                  </Button>
                </div>
              </TabsContent>

              {/* ---------- Files ---------- */}
              <TabsContent value="files" className="space-y-4 pt-4">
                <div className="space-y-2">
                  {(Array.isArray(editCourse.attachments) ? editCourse.attachments : []).map((att: Any, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm truncate">{att.name}</span>
                      {att.size_label && <span className="text-xs text-muted-foreground shrink-0">{att.size_label}</span>}
                      <Button size="icon" variant="ghost" onClick={() => deleteAttachment(att)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                    </div>
                  ))}
                  {(!Array.isArray(editCourse.attachments) || editCourse.attachments.length === 0) && (
                    <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
                  )}
                </div>
                <Label htmlFor="file-upload"
                  className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  <Download className="w-6 h-6 text-muted-foreground mb-1" />
                  <span className="text-sm text-muted-foreground">{uploading ? "Uploading…" : "Click to upload PDF / Word / PowerPoint"}</span>
                  <span className="text-xs text-muted-foreground mt-1">Stored in training-materials/{editCourse.id}/</span>
                  <input id="file-upload" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
                </Label>
              </TabsContent>

              {/* ---------- Links ---------- */}
              <TabsContent value="links" className="space-y-4 pt-4">
                <div className="space-y-2">
                  {editLinks.length === 0 && <p className="text-sm text-muted-foreground">No reference links yet.</p>}
                  {editLinks.map((lnk, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                      <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{lnk.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{lnk.url}</div>
                      </div>
                      {lnk.type && <Badge variant="outline" className="text-[10px] shrink-0">{lnk.type}</Badge>}
                      <Button size="icon" variant="ghost" onClick={() => setEditLinks(editLinks.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add link</p>
                  <Input placeholder="Label (e.g., FINTRAC STR Guidance)" value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} />
                  <Input placeholder="URL (https://…)" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} />
                  <Select value={newLink.type} onValueChange={(v) => setNewLink({ ...newLink, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Official Guidance">Official Guidance</SelectItem>
                      <SelectItem value="Statute">Statute</SelectItem>
                      <SelectItem value="Portal">Portal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" disabled={!newLink.label || !newLink.url}
                    onClick={() => { setEditLinks([...editLinks, { ...newLink }]); setNewLink({ label: "", url: "", type: "Official Guidance" }); }}>
                    <Plus className="w-4 h-4 mr-1" />Add to list
                  </Button>
                </div>
                <Button onClick={() => patchCourse.mutate({ resources: editLinks })} disabled={patchCourse.isPending}>
                  {patchCourse.isPending ? "Saving…" : "Save reference links"}
                </Button>
              </TabsContent>
            </Tabs>
          )}
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
