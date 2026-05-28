import { useState } from "react";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ShieldAlert, RefreshCw, Database } from "lucide-react";

type Match = {
  id: string;
  screening_id: string;
  watchlist_id: string;
  score: number;
  match_type: string;
  disposition: string;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  aml_screenings: {
    id: string;
    user_id: string;
    subject_name: string;
    subject_dob: string | null;
    subject_country: string | null;
    trigger: string;
    screened_at: string;
  };
  aml_watchlist: {
    id: string;
    source: string;
    name: string;
    aliases: string[];
    dob_year: number | null;
    countries: string[];
    programs: string[];
    source_url: string | null;
  };
};

const sourceColors: Record<string, string> = {
  ofac: "bg-red-500/15 text-red-600 dark:text-red-400",
  un: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  uk: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  eu: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  ca: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  pep: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const AmlReviewPage = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [selected, setSelected] = useState<Match | null>(null);
  const [notes, setNotes] = useState("");
  const [ingesting, setIngesting] = useState(false);

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["aml-matches", tab],
    queryFn: async () => {
      const q = supabase
        .from("aml_matches")
        .select(`
          id, screening_id, watchlist_id, score, match_type, disposition, reviewed_at, notes, created_at,
          aml_screenings ( id, user_id, subject_name, subject_dob, subject_country, trigger, screened_at ),
          aml_watchlist ( id, source, name, aliases, dob_year, countries, programs, source_url )
        `)
        .order("created_at", { ascending: false })
        .limit(200);
      if (tab === "pending") q.eq("disposition", "pending");
      else if (tab === "reviewed") q.neq("disposition", "pending");
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Match[]) || [];
    },
  });

  const { data: watchlistStats } = useQuery({
    queryKey: ["aml-watchlist-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("aml_watchlist").select("source");
      const counts: Record<string, number> = {};
      (data || []).forEach((r: { source: string }) => {
        counts[r.source] = (counts[r.source] || 0) + 1;
      });
      return counts;
    },
  });

  const triggerIngest = async () => {
    setIngesting(true);
    try {
      const { error } = await supabase.functions.invoke("aml-ingest-lists", { body: {} });
      if (error) throw error;
      toast.success("Watchlist refresh started");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["aml-watchlist-stats"] }), 3000);
    } catch (e: unknown) {
      toast.error(`Ingest failed: ${(e as Error).message}`);
    } finally {
      setIngesting(false);
    }
  };

  const submitDisposition = async (disposition: "true_match" | "false_positive" | "escalated") => {
    if (!selected) return;
    try {
      const { error } = await supabase.functions.invoke("aml-review", {
        body: { match_id: selected.id, disposition, notes },
      });
      if (error) throw error;
      toast.success(`Marked as ${disposition.replace("_", " ")}`);
      setSelected(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["aml-matches"] });
    } catch (e: unknown) {
      toast.error(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-primary" />
              AML & PEP Screening
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              In-house sanctions and politically exposed persons engine. Matches require admin review.
            </p>
          </div>
          <Button onClick={triggerIngest} disabled={ingesting} variant="outline" className="gap-2">
            <RefreshCw className={ingesting ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
            Refresh watchlists
          </Button>
        </div>

        {/* Watchlist sources */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Watchlist sources</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["ofac", "un", "uk", "eu", "ca", "pep"] as const).map((s) => (
              <Badge key={s} className={`${sourceColors[s]} border-0 font-mono`}>
                {s.toUpperCase()}: {watchlistStats?.[s]?.toLocaleString() ?? 0}
              </Badge>
            ))}
          </div>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending">Pending review</TabsTrigger>
            <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <Card className="overflow-hidden">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
              ) : matches.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {tab === "pending" ? "No pending matches. All clear." : "No reviewed matches yet."}
                </div>
              ) : (
                <div className="divide-y">
                  {matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelected(m); setNotes(m.notes || ""); }}
                      className="w-full text-left p-4 hover:bg-accent/50 transition-colors flex items-center gap-4"
                    >
                      <Badge className={`${sourceColors[m.aml_watchlist?.source] || ""} border-0 font-mono shrink-0`}>
                        {m.aml_watchlist?.source?.toUpperCase()}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {m.aml_screenings?.subject_name} <span className="text-muted-foreground">vs</span>{" "}
                          {m.aml_watchlist?.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          Trigger: {m.aml_screenings?.trigger} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-semibold">{(m.score * 100).toFixed(0)}%</div>
                        <Badge variant="outline" className="text-[10px] mt-1">{m.disposition.replace("_", " ")}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Match review</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Subject</div>
                  <div className="font-medium">{selected.aml_screenings.subject_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {selected.aml_screenings.subject_dob || "DOB: unknown"}
                    {selected.aml_screenings.subject_country && ` · ${selected.aml_screenings.subject_country}`}
                  </div>
                  <div className="text-xs">Trigger: <span className="font-mono">{selected.aml_screenings.trigger}</span></div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Watchlist record</div>
                  <div className="font-medium">{selected.aml_watchlist.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {selected.aml_watchlist.dob_year ? `Born ${selected.aml_watchlist.dob_year}` : "DOB: unknown"}
                    {selected.aml_watchlist.countries?.length ? ` · ${selected.aml_watchlist.countries.join(", ")}` : ""}
                  </div>
                  <Badge className={`${sourceColors[selected.aml_watchlist.source]} border-0`}>
                    {selected.aml_watchlist.source.toUpperCase()}
                  </Badge>
                  {selected.aml_watchlist.programs?.length > 0 && (
                    <div className="text-xs text-muted-foreground">Programs: {selected.aml_watchlist.programs.join(", ")}</div>
                  )}
                  {selected.aml_watchlist.aliases?.length > 0 && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Aliases:</span> {selected.aml_watchlist.aliases.slice(0, 3).join(", ")}
                      {selected.aml_watchlist.aliases.length > 3 && "…"}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-accent/30 rounded-lg text-sm">
                <span className="text-muted-foreground">Score</span>
                <span className="font-mono font-bold">{(selected.score * 100).toFixed(1)}%</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">Match type</span>
                <span className="font-mono">{selected.match_type}</span>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground mb-1 block">
                  Reviewer notes
                </label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Why is this a true/false match?" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => submitDisposition("false_positive")}>
              False positive
            </Button>
            <Button variant="default" onClick={() => submitDisposition("true_match")}>
              True match
            </Button>
            <Button variant="destructive" onClick={() => submitDisposition("escalated")}>
              Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AmlReviewPage;
