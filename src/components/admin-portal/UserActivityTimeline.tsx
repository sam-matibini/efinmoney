import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Mail, MessageSquare, Bell, ShieldCheck, Pencil, Phone, Plus, History, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUserActivity, type ActivitySource, type UnifiedActivity } from "@/hooks/useUserActivity";

const FILTERS: { value: ActivitySource | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "communication", label: "Messages" },
  { value: "notification", label: "Notifications" },
  { value: "support", label: "Support" },
  { value: "account", label: "Account events" },
  { value: "staff_change", label: "Staff changes" },
];

const sourceIcon = (a: UnifiedActivity) => {
  switch (a.source) {
    case "communication": return a.kind === "phone_call" ? Phone : Mail;
    case "notification": return Bell;
    case "support": return MessageSquare;
    case "account": return ShieldCheck;
    default: return Pencil;
  }
};

const sourceTone = (s: ActivitySource) => {
  switch (s) {
    case "communication": return "border-primary/40";
    case "notification": return "border-amber-500/40";
    case "support": return "border-sky-500/40";
    case "account": return "border-emerald-500/40";
    default: return "border-muted-foreground/30";
  }
};

interface Props {
  userId: string;
  /** Only staff may log interactions manually. */
  canLog?: boolean;
}

/** Unified, filterable chronological feed of every interaction with a user. */
export default function UserActivityTimeline({ userId, canLog = false }: Props) {
  const { data: activities = [], isLoading } = useUserActivity(userId);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ActivitySource | "all">("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [channel, setChannel] = useState("phone_call");
  const [direction, setDirection] = useState("outbound");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  const visible = useMemo(
    () => (filter === "all" ? activities : activities.filter((a) => a.source === filter)),
    [activities, filter],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: activities.length };
    for (const a of activities) map[a.source] = (map[a.source] || 0) + 1;
    return map;
  }, [activities]);

  const logInteraction = async () => {
    if (!content.trim()) {
      toast.error("Add a note describing the interaction");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("customer_communications").insert({
        user_id: userId,
        channel,
        direction,
        subject: subject.trim() || null,
        content: content.trim(),
        status: "sent",
        sent_at: new Date().toISOString(),
        created_by: auth.user?.id ?? null,
        metadata: { logged_manually: true },
      });
      if (error) throw error;
      toast.success("Interaction logged");
      setSubject("");
      setContent("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["user-activity-timeline", userId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Activity timeline ({activities.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Every email, message, notification and account change for this user.
          </p>
        </div>
        {canLog && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                <Plus className="w-3.5 h-3.5" /> Log interaction
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log an interaction</DialogTitle>
                <DialogDescription>
                  Record a call, chat or message handled outside the platform.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Channel</Label>
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="phone_call">Phone call</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="in_app">In-app</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Direction</Label>
                    <Select value={direction} onValueChange={setDirection}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">Outbound (we contacted them)</SelectItem>
                        <SelectItem value="inbound">Inbound (they contacted us)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optional summary" />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    rows={4}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="What was discussed or agreed?"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={logInteraction} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({counts[f.value] || 0})
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-2/3" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No activity recorded yet</p>
        ) : (
          <ul className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
            {visible.map((a) => {
              const Icon = sourceIcon(a);
              return (
                <li key={a.id} className={cn("border-l-2 pl-3 py-0.5", sourceTone(a.source))}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {a.title}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                      {a.kind.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {a.body && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-4 whitespace-pre-wrap">{a.body}</p>
                  )}
                  {a.details && (
                    <p className="text-[11px] text-muted-foreground/80 mt-1">
                      {Object.entries(a.details)
                        .filter(([, v]) => v !== null && v !== undefined && v !== "")
                        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {format(new Date(a.createdAt), "MMM d, yyyy HH:mm")}
                    {a.actor ? ` · ${a.actor}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
