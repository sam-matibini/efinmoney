import { useMemo, useState } from "react";
import { Megaphone, Plus, Send, Clock, FileText, Trash2, Users, Mail, Bell, ArrowLeft, Loader2, X, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  useBroadcasts, useCreateBroadcast, useSendBroadcast, useDeleteBroadcast, useAudienceCount, useUserSearch,
  type Audience, type Broadcast, type BroadcastStatus, type UserSearchResult,
} from "@/hooks/useBroadcasts";

const TIERS = [
  { v: "tier_0", l: "Tier 0" }, { v: "tier_1", l: "Tier 1" },
  { v: "tier_2", l: "Tier 2" }, { v: "tier_3", l: "Tier 3" },
];
const STATUSES = [
  { v: "pending", l: "Pending" }, { v: "submitted", l: "Submitted" },
  { v: "verified", l: "Verified" }, { v: "rejected", l: "Rejected" }, { v: "expired", l: "Expired" },
];
const COUNTRIES = [
  { v: "NG", l: "Nigeria" }, { v: "KE", l: "Kenya" }, { v: "GH", l: "Ghana" },
  { v: "ZM", l: "Zambia" }, { v: "CA", l: "Canada" }, { v: "US", l: "USA" }, { v: "GB", l: "UK" },
];

const STATUS_STYLE: Record<BroadcastStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-amber-500/15 text-amber-600",
  sending: "bg-blue-500/15 text-blue-600",
  sent: "bg-emerald-500/15 text-emerald-600",
  failed: "bg-rose-500/15 text-rose-600",
};

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
      active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted",
    )}
  >
    {children}
  </button>
);

function audienceSummary(a: Audience): string {
  if (a.scope === "all") return "All users";
  if (a.scope === "users") return `${a.user_ids?.length ?? 0} specific user(s)`;
  const parts: string[] = [];
  if (a.kyc_tier?.length) parts.push(a.kyc_tier.map((t) => t.replace("tier_", "T")).join("/"));
  if (a.kyc_status?.length) parts.push(a.kyc_status.join("/"));
  if (a.country_code?.length) parts.push(a.country_code.join("/"));
  return parts.length ? `Segment: ${parts.join(" · ")}` : "Segment (all)";
}

export default function CommunicationHubPage() {
  const [view, setView] = useState<"list" | "compose">("list");
  const { data: broadcasts = [], isLoading } = useBroadcasts();
  const del = useDeleteBroadcast();
  const sendExisting = useSendBroadcast();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Communication Hub</h1>
            <p className="text-sm text-muted-foreground">Broadcast announcements to your users</p>
          </div>
        </div>
        {view === "list" ? (
          <Button onClick={() => setView("compose")} className="gap-2">
            <Plus className="w-4 h-4" /> New broadcast
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setView("list")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        )}
      </div>

      {view === "compose" ? (
        <Compose onDone={() => setView("list")} />
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : broadcasts.length === 0 ? (
            <div className="p-12 text-center">
              <Megaphone className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No broadcasts yet. Create your first announcement.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Audience</th>
                  <th className="px-4 py-3 font-semibold">Channels</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Delivered</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {broadcasts.map((b) => (
                  <BroadcastRow key={b.id} b={b} onDelete={() => del.mutate(b.id)} onSend={() => {
                    sendExisting.mutate(b.id, {
                      onSuccess: () => toast.success("Broadcast sent"),
                      onError: (e) => toast.error(`Send failed: ${(e as Error).message}`),
                    });
                  }} sending={sendExisting.isPending} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function BroadcastRow({ b, onDelete, onSend, sending }: { b: Broadcast; onDelete: () => void; onSend: () => void; sending: boolean }) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3">
        <div className="font-medium truncate max-w-[180px]">{b.title}</div>
        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{b.body}</div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{audienceSummary(b.audience)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5 text-muted-foreground">
          <Bell className="w-4 h-4" aria-label="In-app" />
          {b.channels?.includes("email") && <Mail className="w-4 h-4" aria-label="Email" />}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold capitalize", STATUS_STYLE[b.status])}>{b.status}</span>
        {b.status === "failed" && b.error && <div className="text-[10px] text-rose-500 mt-1 max-w-[140px] truncate" title={b.error}>{b.error}</div>}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {b.status === "sent" ? `${b.in_app_count} in-app${b.email_count ? ` · ${b.email_count} email` : ""}` : "—"}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {b.status === "scheduled" && b.scheduled_at ? `Scheduled ${format(new Date(b.scheduled_at), "MMM d, HH:mm")}`
          : b.sent_at ? formatDistanceToNow(new Date(b.sent_at), { addSuffix: true })
          : formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          {b.status === "draft" && (
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={onSend} disabled={sending}>
              <Send className="w-3.5 h-3.5" /> Send
            </Button>
          )}
          {(b.status === "draft" || b.status === "failed" || b.status === "scheduled") && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-rose-500" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function Compose({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<Audience["scope"]>("all");
  const [tiers, setTiers] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
  const [term, setTerm] = useState("");
  const [emailOn, setEmailOn] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirm, setConfirm] = useState(false);

  const create = useCreateBroadcast();
  const send = useSendBroadcast();
  const { data: searchResults = [] } = useUserSearch(term);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const audience: Audience = useMemo(() => {
    if (scope === "all") return { scope: "all" };
    if (scope === "users") return { scope: "users", user_ids: selectedUsers.map((u) => u.user_id) };
    return { scope: "segment", kyc_tier: tiers, kyc_status: statuses, country_code: countries };
  }, [scope, tiers, statuses, countries, selectedUsers]);

  const { data: count = 0, isFetching: counting } = useAudienceCount(audience);
  const channels = emailOn ? ["in_app", "email"] : ["in_app"];
  const valid = title.trim() && body.trim() && (scope !== "users" || selectedUsers.length > 0) && (!schedule || scheduledAt);

  const reset = () => { onDone(); };

  const saveDraft = async () => {
    try {
      await create.mutateAsync({ input: { title, body, audience, channels }, status: "draft" });
      toast.success("Draft saved");
      reset();
    } catch (e) { toast.error((e as Error).message); }
  };

  const doSchedule = async () => {
    if (new Date(scheduledAt).getTime() <= Date.now()) { toast.error("Pick a future date/time"); return; }
    try {
      await create.mutateAsync({ input: { title, body, audience, channels, scheduled_at: new Date(scheduledAt).toISOString() }, status: "scheduled" });
      toast.success("Broadcast scheduled");
      reset();
    } catch (e) { toast.error((e as Error).message); }
  };

  const sendNow = async () => {
    setConfirm(false);
    try {
      const b = await create.mutateAsync({ input: { title, body, audience, channels }, status: "draft" });
      await send.mutateAsync(b.id);
      toast.success(`Broadcast sent to ${count} user${count === 1 ? "" : "s"}`);
      reset();
    } catch (e) { toast.error(`Send failed: ${(e as Error).message}`); }
  };

  const busy = create.isPending || send.isPending;

  return (
    <div className="space-y-6">
      {/* Message */}
      <section className="rounded-2xl border border-border p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Message</h2>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New: send to Ghana instantly" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label>Body</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your announcement…" rows={5} />
        </div>
        {/* Preview */}
        {(title || body) && (
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Preview (in-app)</div>
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Megaphone className="w-4 h-4" /></div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{title || "Title"}</div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap">{body || "Body…"}</div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Audience */}
      <section className="rounded-2xl border border-border p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Audience</h2>
        <div className="flex gap-2">
          {(["all", "segment", "users"] as const).map((s) => (
            <Chip key={s} active={scope === s} onClick={() => setScope(s)}>
              {s === "all" ? "All users" : s === "segment" ? "Segment" : "Specific users"}
            </Chip>
          ))}
        </div>

        {scope === "segment" && (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">KYC tier</div>
              <div className="flex flex-wrap gap-2">{TIERS.map((t) => <Chip key={t.v} active={tiers.includes(t.v)} onClick={() => toggle(tiers, setTiers, t.v)}>{t.l}</Chip>)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">KYC status</div>
              <div className="flex flex-wrap gap-2">{STATUSES.map((t) => <Chip key={t.v} active={statuses.includes(t.v)} onClick={() => toggle(statuses, setStatuses, t.v)}>{t.l}</Chip>)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Country</div>
              <div className="flex flex-wrap gap-2">{COUNTRIES.map((t) => <Chip key={t.v} active={countries.includes(t.v)} onClick={() => toggle(countries, setCountries, t.v)}>{t.l}</Chip>)}</div>
            </div>
            <p className="text-xs text-muted-foreground">Leave a group empty to include everyone in it. Filters combine (AND).</p>
          </div>
        )}

        {scope === "users" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by name, email or @efintag" className="pl-9" />
            </div>
            {term.length >= 2 && searchResults.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto">
                {searchResults.filter((r) => !selectedUsers.some((s) => s.user_id === r.user_id)).map((r) => (
                  <button key={r.user_id} type="button" onClick={() => { setSelectedUsers([...selectedUsers, r]); setTerm(""); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="font-medium">{r.full_name || r.email}</span>
                    <span className="text-xs text-muted-foreground ml-2">{r.efin_tag || r.email}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map((u) => (
                <span key={u.user_id} className="inline-flex items-center gap-1.5 bg-muted rounded-full pl-3 pr-1.5 py-1 text-xs">
                  {u.full_name || u.email}
                  <button type="button" onClick={() => setSelectedUsers(selectedUsers.filter((s) => s.user_id !== u.user_id))} className="hover:text-rose-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm font-medium text-primary">
          {counting ? "Counting…" : `This will reach ~${count.toLocaleString()} ${count === 1 ? "person" : "people"}`}
        </div>
      </section>

      {/* Channels */}
      <section className="rounded-2xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Bell className="w-4 h-4" /> Channels</h2>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm"><Bell className="w-4 h-4 text-primary" /> In-app notification</div>
          <span className="text-xs text-muted-foreground">Always on</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-primary" /> Email (Resend)</div>
          <Switch checked={emailOn} onCheckedChange={setEmailOn} />
        </div>
        {emailOn && <p className="text-xs text-muted-foreground">Only sent to users who haven't opted out. An unsubscribe link is added automatically.</p>}
      </section>

      {/* Delivery */}
      <section className="rounded-2xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4" /> Delivery</h2>
        <div className="flex gap-2">
          <Chip active={!schedule} onClick={() => setSchedule(false)}>Send now</Chip>
          <Chip active={schedule} onClick={() => setSchedule(true)}>Schedule</Chip>
        </div>
        {schedule && (
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="max-w-xs" />
        )}
      </section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pb-4">
        <Button variant="ghost" onClick={saveDraft} disabled={busy || !title.trim() || !body.trim()}>Save draft</Button>
        {schedule ? (
          <Button onClick={doSchedule} disabled={busy || !valid} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Schedule
          </Button>
        ) : (
          <Button onClick={() => setConfirm(true)} disabled={busy || !valid} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send now
          </Button>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to message <strong>~{count.toLocaleString()}</strong> {count === 1 ? "user" : "users"} via{" "}
              <strong>{emailOn ? "In-app + Email" : "In-app"}</strong>. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sendNow}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
