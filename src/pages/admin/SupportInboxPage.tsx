import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, Headphones, UserCheck, Inbox, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useSupportThreads, useThreadMessages, useSendMessage, useUpdateThread, useProfilesByIds,
  type SupportThread, type ThreadStatus,
} from "@/hooks/useSupport";
import AttachmentItem from "@/components/support/AttachmentItem";

const STATUS_STYLE: Record<ThreadStatus, string> = {
  open: "bg-emerald-500/15 text-emerald-600",
  pending: "bg-amber-500/15 text-amber-600",
  resolved: "bg-blue-500/15 text-blue-600",
  closed: "bg-muted text-muted-foreground",
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/15 text-blue-600",
  high: "bg-amber-500/15 text-amber-600",
  urgent: "bg-red-500/15 text-red-600",
};

const PRIO_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export default function SupportInboxPage() {
  const { data: threads = [], isLoading } = useSupportThreads();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "unread">("open");

  const ids = useMemo(
    () => Array.from(new Set(threads.map((t) => t.user_id).filter((id): id is string => !!id))),
    [threads]
  );
  const { data: profiles = {} } = useProfilesByIds(ids);

  // Guest threads (Contact form / live chat) have no profile — fall back to the
  // name/email captured at submission.
  const nameFor = (t: SupportThread) =>
    (t.user_id && (profiles[t.user_id]?.full_name || profiles[t.user_id]?.email)) ||
    t.guest_name || t.guest_email || "User";

  const filtered = useMemo(() =>
    threads
      .filter((t) =>
        filter === "all" ? true : filter === "unread" ? t.unread_for_staff : t.status === "open" || t.status === "pending"
      )
      .sort((a, b) => (PRIO_ORDER[a.priority ?? "normal"] ?? 2) - (PRIO_ORDER[b.priority ?? "normal"] ?? 2)),
    [threads, filter]);

  const active = threads.find((t) => t.id === activeId) || null;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Headphones className="w-5 h-5" /></div>
        <div>
          <h1 className="text-xl font-bold">Support Inbox</h1>
          <p className="text-sm text-muted-foreground">Two-way conversations with your users</p>
        </div>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-13rem)]">
        {/* Thread list */}
        <div className="rounded-2xl border border-border flex flex-col overflow-hidden">
          <div className="flex gap-1 p-2 border-b border-border">
            {(["open", "unread", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn("flex-1 text-xs font-semibold py-1.5 rounded-lg capitalize transition-colors",
                  filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {isLoading ? (
              <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center"><Inbox className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" /><p className="text-xs text-muted-foreground">No conversations</p></div>
            ) : filtered.map((t) => {
              return (
                <button key={t.id} onClick={() => setActiveId(t.id)}
                  className={cn("w-full text-left p-3 hover:bg-muted/40 transition-colors", activeId === t.id && "bg-muted/60")}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate flex-1">{nameFor(t)}</span>
                    {t.channel && t.channel !== "app" && (
                      <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-600 shrink-0">
                        {t.channel === "contact" ? "Guest" : t.channel}
                      </span>
                    )}
                    {t.priority === "urgent" && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    {t.unread_for_staff && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  <div className="text-xs font-medium truncate text-foreground/80">{t.subject}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.last_message_preview}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full", STATUS_STYLE[t.status])}>{t.status}</span>
                    {t.priority && t.priority !== "normal" && (
                      <span className={cn("text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full", PRIORITY_STYLE[t.priority])}>{t.priority}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation */}
        <div className="rounded-2xl border border-border overflow-hidden">
          {active ? <Conversation key={active.id} thread={active} customerName={nameFor(active)} />
            : <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Select a conversation</div>}
        </div>
      </div>
    </div>
  );
}

function Conversation({ thread, customerName }: { thread: SupportThread; customerName: string }) {
  const { user } = useAuth();
  const { data: messages = [] } = useThreadMessages(thread.id);
  const send = useSendMessage();
  const update = useUpdateThread();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thread.unread_for_staff) update.mutate({ id: thread.id, patch: { unread_for_staff: false } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const submit = () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText("");
    send.mutate({ threadId: thread.id, body, role: "staff" }, { onError: (e) => toast.error((e as Error).message) });
  };

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <div className="flex items-center gap-3 p-3 border-b border-border">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{customerName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {thread.subject}
            {thread.guest_email && !thread.user_id && (
              <span className="ml-1.5 text-violet-600">· replies emailed to {thread.guest_email}</span>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 h-8"
          onClick={() => update.mutate({ id: thread.id, patch: { assigned_to: user?.id ?? null } })}
          disabled={thread.assigned_to === user?.id}>
          <UserCheck className="w-3.5 h-3.5" /> {thread.assigned_to === user?.id ? "Assigned to you" : "Assign to me"}
        </Button>
        <Select
          value={thread.priority ?? "normal"}
          onValueChange={(v) =>
            update.mutate({
              id: thread.id,
              patch: {
                priority: v as "low" | "normal" | "high" | "urgent",
                ...(v === "urgent" ? { escalated_at: new Date().toISOString() } : {}),
              },
            })
          }>
          <SelectTrigger className={cn("w-28 h-8",
            thread.priority === "urgent" && "border-red-500 text-red-600",
            thread.priority === "high" && "border-amber-500 text-amber-600")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={thread.status} onValueChange={(v) => update.mutate({ id: thread.id, patch: { status: v as ThreadStatus } })}>
          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.sender_role === "staff" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
              m.sender_role === "staff" ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {m.body}
              {(m.attachments || []).length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {m.attachments.map((a, i) => <AttachmentItem key={i} a={a} />)}
                </div>
              )}
              <div className={cn("text-[10px] mt-1", m.sender_role === "staff" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-center gap-2 p-3 border-t border-border">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to the user…" disabled={send.isPending} />
        <Button type="submit" size="icon" disabled={send.isPending || !text.trim()}>
          {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </form>
    </div>
  );
}
