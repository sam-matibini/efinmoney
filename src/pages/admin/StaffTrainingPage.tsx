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
import { GraduationCap, Plus, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import AdminLayout from "@/components/admin-portal/AdminLayout";

export default function StaffTrainingPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ course_name: "", category: "aml", frequency_months: "12", is_mandatory: false });
  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState({ course_id: "", course_name: "", score: "" });

  const { data: courses = [], isLoading: cLoading } = useQuery({
    queryKey: ["training-courses"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("training_courses").select("*").order("category");
      return data || [];
    },
  });

  const { data: records = [], isLoading: rLoading } = useQuery({
    queryKey: ["training-records"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("training_records").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const addCourse = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("training_courses").insert({ ...form, frequency_months: Number(form.frequency_months) });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["training-courses"] }); setShowAdd(false); setForm({ course_name: "", category: "aml", frequency_months: "12", is_mandatory: false }); toast.success("Course added"); },
    onError: () => toast.error("Failed to add course"),
  });

  const logCompletion = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const score = logForm.score ? Number(logForm.score) : null;
      const expiry = new Date(); expiry.setMonth(expiry.getMonth() + 12);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("training_records").insert({ staff_id: user?.id, course_id: logForm.course_id || null, course_name: logForm.course_name, completed_at: new Date().toISOString(), score, passed: !score || score >= 70, expiry_date: expiry.toISOString().split("T")[0] });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["training-records"] }); setShowLog(false); setLogForm({ course_id: "", course_name: "", score: "" }); toast.success("Completion logged"); },
    onError: () => toast.error("Failed to log completion"),
  });

  const expired = records.filter((r: any) => r.expiry_date && isPast(new Date(r.expiry_date))).length;

  return (
    <AdminLayout>
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Staff Training Records</h1><p className="text-muted-foreground">AML, compliance, sanctions training — completion tracking and expiry monitoring</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowLog(true)}><CheckCircle2 className="w-4 h-4 mr-1" />Log Completion</Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Course</Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{courses.length}</div><div className="text-xs text-muted-foreground">Courses</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{records.length}</div><div className="text-xs text-muted-foreground">Completions</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{expired}</div><div className="text-xs text-muted-foreground">Expired certs</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="w-5 h-5" />Course Catalogue</CardTitle></CardHeader>
        <CardContent>
          {cLoading ? <Skeleton className="h-24 w-full" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Course</TableHead><TableHead>Category</TableHead><TableHead>Mandatory</TableHead><TableHead>Frequency</TableHead></TableRow></TableHeader>
              <TableBody>
                {courses.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No courses. Add your first course above.</TableCell></TableRow> : courses.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.course_name}</TableCell>
                    <TableCell className="capitalize">{c.category}</TableCell>
                    <TableCell>{c.is_mandatory ? <Badge className="bg-red-500/10 text-red-600">Mandatory</Badge> : <Badge className="bg-muted">Optional</Badge>}</TableCell>
                    <TableCell>Every {c.frequency_months} months</TableCell>
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
                {records.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No completions logged.</TableCell></TableRow> : records.map((r: any) => {
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
              <Switch
                id="mandatory-toggle"
                checked={form.is_mandatory}
                onCheckedChange={(v) => setForm({ ...form, is_mandatory: v })}
              />
              <Label htmlFor="mandatory-toggle" className="cursor-pointer">
                Mandatory for all staff
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addCourse.mutate()} disabled={addCourse.isPending || !form.course_name}>{addCourse.isPending ? "Adding..." : "Add Course"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Training Completion</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Course</Label>
              <Select value={logForm.course_id} onValueChange={(v) => { const c = courses.find((c: any) => c.id === v); setLogForm({ ...logForm, course_id: v, course_name: c?.course_name || "" }); }}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>{courses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.course_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
