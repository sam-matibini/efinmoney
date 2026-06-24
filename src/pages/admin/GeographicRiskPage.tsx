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
import { Globe, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const riskBadge = (r: string) => {
  const m: Record<string, string> = { low: "bg-emerald-500/10 text-emerald-600", medium: "bg-amber-500/10 text-amber-600", high: "bg-red-500/10 text-red-600", prohibited: "bg-red-700/10 text-red-700 font-bold" };
  return <Badge className={m[r] || ""}>{r}</Badge>;
};

export default function GeographicRiskPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ country_code: "", country_name: "", risk_level: "medium", fatf_status: "member" });

  const { data: countries = [], isLoading } = useQuery({
    queryKey: ["geographic-risk"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("geographic_risk_ratings").select("*").order("risk_level").order("country_name");
      return data || [];
    },
    refetchInterval: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("geographic_risk_ratings").upsert({ ...form, country_code: form.country_code.toUpperCase(), updated_at: new Date().toISOString() }, { onConflict: "country_code" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["geographic-risk"] }); setShowAdd(false); setForm({ country_code: "", country_name: "", risk_level: "medium", fatf_status: "member" }); toast.success("Country rating saved"); },
    onError: () => toast.error("Failed to save"),
  });

  const prohibited = countries.filter((c: any) => c.risk_level === "prohibited").length;
  const high = countries.filter((c: any) => c.risk_level === "high").length;
  const sanctioned = countries.filter((c: any) => c.un_sanctions || c.ofac_sanctions).length;

  return (
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Geographic Risk</h1><p className="text-muted-foreground">Country risk ratings, FATF status, and sanctions lists</p></div>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Country</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-700">{prohibited}</div><div className="text-xs text-muted-foreground">Prohibited</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-red-500">{high}</div><div className="text-xs text-muted-foreground">High risk</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold text-amber-500">{sanctioned}</div><div className="text-xs text-muted-foreground">Sanctioned</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" />Country Risk Register</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Country</TableHead><TableHead>Risk Level</TableHead><TableHead>FATF</TableHead><TableHead>UN Sanctions</TableHead><TableHead>OFAC</TableHead></TableRow></TableHeader>
              <TableBody>
                {countries.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-bold">{c.country_code}</TableCell>
                    <TableCell className="font-medium">{c.country_name}</TableCell>
                    <TableCell>{riskBadge(c.risk_level)}</TableCell>
                    <TableCell><Badge className={c.fatf_status === "blacklisted" ? "bg-red-500/10 text-red-600" : c.fatf_status === "monitored" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}>{c.fatf_status}</Badge></TableCell>
                    <TableCell>{c.un_sanctions ? <Badge className="bg-red-500/10 text-red-600">Yes</Badge> : <Badge className="bg-muted">No</Badge>}</TableCell>
                    <TableCell>{c.ofac_sanctions ? <Badge className="bg-red-500/10 text-red-600">Yes</Badge> : <Badge className="bg-muted">No</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add / Update Country Rating</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Country Code</Label><Input value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })} placeholder="CA" maxLength={2} /></div>
              <div><Label>Country Name</Label><Input value={form.country_name} onChange={(e) => setForm({ ...form, country_name: e.target.value })} placeholder="Canada" /></div>
            </div>
            <div><Label>Risk Level</Label>
              <Select value={form.risk_level} onValueChange={(v) => setForm({ ...form, risk_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="prohibited">Prohibited</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>FATF Status</Label>
              <Select value={form.fatf_status} onValueChange={(v) => setForm({ ...form, fatf_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="monitored">Monitored</SelectItem><SelectItem value="blacklisted">Blacklisted</SelectItem><SelectItem value="non_member">Non-member</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.country_code || !form.country_name}>{addMutation.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
