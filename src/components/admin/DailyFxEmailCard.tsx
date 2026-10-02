import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, Loader2, Mail, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type Settings = { enabled: boolean; promo_text: string | null; promo_url: string | null; updated_at: string };
type Run = {
  id: string;
  send_date: string;
  kind: "daily" | "test";
  status: "sending" | "sent" | "failed";
  subject: string | null;
  recipient_count: number;
  email_count: number;
  error: string | null;
  created_at: string;
};

// Tables are newer than the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const STATUS_STYLE: Record<Run["status"], string> = {
  sending: "bg-blue-500/15 text-blue-600",
  sent: "bg-emerald-500/15 text-emerald-600",
  failed: "bg-rose-500/15 text-rose-600",
};

async function invoke(mode: "preview" | "test") {
  const { data, error } = await supabase.functions.invoke("alice-daily-fx", { body: { mode } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { subject: string; html?: string; sent_to?: string };
}

/** Communication Hub card for Alice's automated 08:00 ET daily rates email. */
export default function DailyFxEmailCard() {
  const qc = useQueryClient();
  const [promoText, setPromoText] = useState("");
  const [promoUrl, setPromoUrl] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["daily-fx-email-settings"],
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await db.from("daily_fx_email_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["daily-fx-email-runs"],
    queryFn: async (): Promise<Run[]> => {
      const { data, error } = await db.from("daily_fx_email_runs").select("*").order("created_at", { ascending: false }).limit(7);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    setPromoText(settings?.promo_text ?? "");
    setPromoUrl(settings?.promo_url ?? "");
  }, [settings?.promo_text, settings?.promo_url]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await db.from("daily_fx_email_settings")
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["daily-fx-email-settings"] }),
    onError: (e) => toast.error(`Couldn't save: ${(e as Error).message}`),
  });

  const previewMut = useMutation({
    mutationFn: () => invoke("preview"),
    onSuccess: (d) => setPreview({ subject: d.subject, html: d.html ?? "" }),
    onError: (e) => toast.error(`Preview failed: ${(e as Error).message}`),
  });

  const testMut = useMutation({
    mutationFn: () => invoke("test"),
    onSuccess: (d) => {
      toast.success(`Test sent to ${d.sent_to}`);
      qc.invalidateQueries({ queryKey: ["daily-fx-email-runs"] });
    },
    onError: (e) => toast.error(`Test failed: ${(e as Error).message}`),
  });

  const promoDirty = (settings?.promo_text ?? "") !== promoText || (settings?.promo_url ?? "") !== promoUrl;
  const lastDaily = runs.find((r) => r.kind === "daily");

  return (
    <section className="rounded-2xl border border-border p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold">Alice daily rates email</h2>
            <p className="text-sm text-muted-foreground">
              Sent automatically every day at 8:00 AM Eastern to all clients who haven't unsubscribed. Alice writes the intro and tip;
              rates are live, and each client sees their own corridors first.
            </p>
            {lastDaily && (
              <p className="mt-1 text-xs text-muted-foreground">
                Last sent {format(new Date(lastDaily.created_at), "MMM d, h:mm a")} to {lastDaily.email_count} of {lastDaily.recipient_count} clients
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="daily-fx-enabled" className="text-sm">{settings?.enabled ? "On" : "Paused"}</Label>
          <Switch
            id="daily-fx-enabled"
            checked={!!settings?.enabled}
            disabled={isLoading || save.isPending}
            onCheckedChange={(v) =>
              save.mutate({ enabled: v }, { onSuccess: () => toast.success(v ? "Daily email turned on" : "Daily email paused") })
            }
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_260px_auto] items-end">
        <div className="space-y-1.5">
          <Label htmlFor="daily-fx-promo">Promo line (optional)</Label>
          <Input
            id="daily-fx-promo"
            value={promoText}
            maxLength={200}
            onChange={(e) => setPromoText(e.target.value)}
            placeholder="e.g. Zero fees on CAD to Kenya transfers this weekend"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="daily-fx-promo-url">Promo link (optional)</Label>
          <Input id="daily-fx-promo-url" value={promoUrl} onChange={(e) => setPromoUrl(e.target.value)} placeholder="https://www.efin.money/..." />
        </div>
        <Button
          variant="outline"
          disabled={!promoDirty || save.isPending}
          onClick={() =>
            save.mutate(
              { promo_text: promoText.trim() || null, promo_url: promoUrl.trim() || null },
              { onSuccess: () => toast.success("Promo saved. It will appear in the next email.") },
            )
          }
        >
          Save promo
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="gap-2" onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
          {previewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Preview today's email
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
          {testMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send test to me
        </Button>
      </div>

      {runs.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="py-2 pr-4 font-semibold">Date</th>
                <th className="py-2 pr-4 font-semibold">Subject</th>
                <th className="py-2 pr-4 font-semibold">Type</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 font-semibold">Delivered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">{format(new Date(r.created_at), "MMM d, h:mm a")}</td>
                  <td className="py-2 pr-4 max-w-[280px] truncate" title={r.error ?? r.subject ?? ""}>
                    {r.status === "failed" ? <span className="text-rose-600">{r.error}</span> : r.subject}
                  </td>
                  <td className="py-2 pr-4 capitalize">{r.kind}</td>
                  <td className="py-2 pr-4"><Badge className={STATUS_STYLE[r.status]} variant="outline">{r.status}</Badge></td>
                  <td className="py-2 whitespace-nowrap"><Mail className="inline w-3.5 h-3.5 mr-1 text-muted-foreground" />{r.email_count}/{r.recipient_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-[640px] p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="text-base">{preview?.subject}</DialogTitle>
          </DialogHeader>
          <iframe title="Email preview" srcDoc={preview?.html} sandbox="" className="w-full h-[70vh] border-0 bg-white" />
        </DialogContent>
      </Dialog>
    </section>
  );
}
