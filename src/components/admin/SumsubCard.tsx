import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import SumsubLaunchModal from "./SumsubLaunchModal";

interface Verification {
  id: string;
  applicant_id: string;
  level_name: string;
  review_status: string | null;
  review_answer: string | null;
  review_reject_type: string | null;
  moderation_comment: string | null;
  risk_labels: any;
  updated_at: string;
}

export default function SumsubCard({ userId, canManage }: { userId: string; canManage: boolean }) {
  const [rows, setRows] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sumsub_verifications")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const refresh = async (applicantId: string) => {
    setRefreshing(applicantId);
    try {
      const { data, error } = await supabase.functions.invoke("sumsub-get-applicant-status", {
        body: { applicant_id: applicantId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Status refreshed");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(null);
    }
  };

  const answerColor = (a: string | null) =>
    a === "GREEN" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
    a === "RED" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
    "bg-amber-500/15 text-amber-600 dark:text-amber-400";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-4 h-4" /> Sumsub Enhanced Due Diligence
        </CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setLaunchOpen(true)}>
            {rows.length ? "Re-run check" : "Launch Sumsub check"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No Sumsub check has been run for this customer. Launch one to perform an enhanced ID + AML verification.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge className={answerColor(r.review_answer)}>
                    {r.review_answer || r.review_status || "PENDING"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{r.level_name}</span>
                </div>
                <Button size="sm" variant="ghost" disabled={refreshing === r.applicant_id}
                  onClick={() => refresh(r.applicant_id)}>
                  <RefreshCw className={`w-3 h-3 mr-1 ${refreshing === r.applicant_id ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {r.review_reject_type && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Reject type: </span>
                  <span className="text-red-600 dark:text-red-400">{r.review_reject_type}</span>
                </div>
              )}
              {r.moderation_comment && (
                <div className="text-xs text-muted-foreground italic">"{r.moderation_comment}"</div>
              )}
              {Array.isArray(r.risk_labels) && r.risk_labels.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {r.risk_labels.map((label: string) => (
                    <Badge key={label} variant="outline" className="text-[10px]">{label}</Badge>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                <span className="font-mono">{r.applicant_id}</span>
                <a
                  href={`https://cockpit.sumsub.com/checkus#/applicant/${r.applicant_id}/client/info`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1"
                >
                  Sumsub dashboard <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {canManage && (
        <SumsubLaunchModal
          open={launchOpen}
          onOpenChange={setLaunchOpen}
          userId={userId}
          onCompleted={load}
        />
      )}
    </Card>
  );
}
