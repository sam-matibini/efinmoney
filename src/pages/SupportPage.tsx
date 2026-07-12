import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, Send, Loader2, MessageSquare, Headphones } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useSupportThreads, useThreadMessages, useCreateThread, useSendMessage, useUpdateThread,
  type SupportThread,
} from "@/hooks/useSupport";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";

const STATUS_LABEL: Record<string, string> = {
  open: "Open", pending: "Pending", resolved: "Resolved", closed: "Closed",
};

const SupportPage = () => {
  const { data: threads = [], isLoading } = useSupportThreads();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composingNew, setComposingNew] = useState(false);

  const active = threads.find((t) => t.id === activeId) || null;

  if (composingNew) return <NewConversation onDone={(id) => { setComposingNew(false); if (id) setActiveId(id); }} onCancel={() => setComposingNew(false)} />;
  if (active) return <Conversation thread={active} onBack={() => setActiveId(null)} />;

  return (
    <AppPage width="narrow" className="py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Headphones className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-bold">Support</h1>
            <p className="text-sm text-muted-foreground">Message our team — we usually reply within a day</p>
          </div>
        </div>
        <Button onClick={() => setComposingNew(true)} className="gap-2"><Plus className="w-4 h-4" /> New</Button>
      </div>

      <PageHeroBanner
        icon={Headphones}
        label="Support center"
        value={`${threads.length} conversation${threads.length === 1 ? "" : "s"}`}
        meta={[
          { icon: MessageSquare, text: "We usually reply within one business day" },
          { icon: Plus, text: "Start a new thread anytime" },
        ]}
        variant="sky"
      />

      {isLoading ? (
        <div className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : threads.length === 0 ? (
        <div className="rounded-2xl border border-border p-12 text-center">
          <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No conversations yet.</p>
          <Button onClick={() => setComposingNew(true)} className="gap-2"><Plus className="w-4 h-4" /> Start a conversation</Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {threads.map((t) => (
            <button key={t.id} onClick={() => setActiveId(t.id)} className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{t.subject}</span>
                  {t.unread_for_user && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{t.last_message_preview}</p>
              </div>
              <div className="text-right shrink-0">
                <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full",
                  t.status === "open" ? "bg-emerald-500/15 text-emerald-600" :
                  t.status === "pending" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground")}>
                  {STATUS_LABEL[t.status]}
                </span>
                <div className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </AppPage>
  );
};

function NewConversation({ onDone, onCancel }: { onDone: (id: string | null) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const create = useCreateThread();

  const submit = async () => {
    if (!subject.trim() || !body.trim()) return;
    try {
      const t = await create.mutateAsync({ subject: subject.trim(), body: body.trim() });
      toast.success("Message sent");
      onDone(t.id);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <AppPage width="narrow" className="py-8">
      <Button variant="ghost" onClick={onCancel} className="gap-2 mb-4"><ArrowLeft className="w-4 h-4" /> Back</Button>
      <div className="rounded-2xl border border-border p-6 space-y-4">
        <h1 className="text-lg font-bold">New conversation</h1>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Message</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Describe your issue…" />
        </div>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={create.isPending || !subject.trim() || !body.trim()} className="gap-2">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
          </Button>
        </div>
      </div>
    </AppPage>
  );
}

function Conversation({ thread, onBack }: { thread: SupportThread; onBack: () => void }) {
  const { data: messages = [] } = useThreadMessages(thread.id);
  const send = useSendMessage();
  const update = useUpdateThread();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Mark as read for the user when opened.
  useEffect(() => {
    if (thread.unread_for_user) update.mutate({ id: thread.id, patch: { unread_for_user: false } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const submit = () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText("");
    send.mutate({ threadId: thread.id, body, role: "user" }, { onError: (e) => toast.error((e as Error).message) });
  };

  const closed = thread.status === "closed";

  return (
    <AppPage width="narrow" className="py-6" innerClassName="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="min-w-0">
          <h1 className="font-semibold truncate">{thread.subject}</h1>
          <p className="text-xs text-muted-foreground capitalize">{thread.status}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.sender_role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
              m.sender_role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {m.sender_role === "staff" && <div className="text-[10px] font-semibold text-primary mb-0.5">Support</div>}
              {m.body}
              <div className={cn("text-[10px] mt-1", m.sender_role === "user" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {closed ? (
        <div className="text-center text-xs text-muted-foreground py-3 border-t border-border">This conversation is closed. Start a new one if you need more help.</div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-center gap-2 pt-3 border-t border-border">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message…" disabled={send.isPending} />
          <Button type="submit" size="icon" disabled={send.isPending || !text.trim()}>
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      )}
    </AppPage>
  );
}

export default SupportPage;
