import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft, Plus, Send, Loader2, MessageSquare, Headphones,
  Paperclip, X, FileText, Share2, Mail, Smartphone, Download,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useSupportThreads, useThreadMessages, useCreateThread, useSendMessage, useUpdateThread,
  getAttachmentUrl,
  type SupportThread, type Attachment,
} from "@/hooks/useSupport";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_LABEL: Record<string, string> = {
  open: "Open", pending: "Pending", resolved: "Resolved", closed: "Closed",
};

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,.doc,.docx";
const MAX_MB = 10;

/* ── Attachment file picker ─────────────────────────────────────────────── */
function FilePicker({
  files, onChange,
}: { files: File[]; onChange: (f: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []).filter((f) => {
      if (f.size > MAX_MB * 1024 * 1024) { toast.error(`${f.name} exceeds ${MAX_MB} MB`); return false; }
      return true;
    });
    onChange([...files, ...picked]);
    e.target.value = "";
  };

  const remove = (i: number) => onChange(files.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg border border-dashed border-border hover:border-primary/50"
      >
        <Paperclip className="w-3.5 h-3.5" /> Attach
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={add} />
      {files.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-2.5 py-1 max-w-[160px]">
          <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{f.name}</span>
          <button type="button" onClick={() => remove(i)} className="ml-0.5 shrink-0 hover:text-destructive"><X className="w-3 h-3" /></button>
        </span>
      ))}
    </div>
  );
}

/* ── Single attachment chip/preview (resolves signed URL) ───────────────── */
function AttachmentItem({ a }: { a: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { getAttachmentUrl(a.path).then(setUrl); }, [a.path]);

  const isImage = a.type.startsWith("image/");

  if (!url) return (
    <span className="inline-flex items-center gap-1 text-xs bg-black/20 rounded px-2 py-1 animate-pulse">
      <FileText className="w-3 h-3" /> {a.name}
    </span>
  );

  return isImage ? (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-1.5">
      <img src={url} alt={a.name} className="max-h-48 rounded-lg object-cover border border-white/20" />
    </a>
  ) : (
    <a
      href={url} target="_blank" rel="noreferrer" download={a.name}
      className="inline-flex items-center gap-1.5 text-xs bg-black/20 hover:bg-black/30 rounded-lg px-2.5 py-1.5 mt-1 transition-colors"
    >
      <Download className="w-3 h-3" /> {a.name}
    </a>
  );
}

/* ── Share dropdown ─────────────────────────────────────────────────────── */
function ShareButton({ thread, messages }: { thread: SupportThread; messages: import("@/hooks/useSupport").SupportMessage[] }) {
  const subject = `Support: ${thread.subject}`;
  const body = `Hi,\n\nI wanted to share this eFinMoney support conversation with you:\n\nSubject: ${thread.subject}\nStatus: ${thread.status}\n\nView it at: https://efin.money/support\n\n— Sent via eFinMoney`;

  const shareEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const shareWhatsApp = () => {
    const text = `eFinMoney Support — "${thread.subject}"\nStatus: ${thread.status}\nhttps://efin.money/support`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const shareSMS = () => {
    const text = `eFinMoney Support — "${thread.subject}" (${thread.status}). Visit: https://efin.money/support`;
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
  };

  const savePDF = () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = messages.map((m) => `
      <div class="msg ${m.sender_role}">
        <div class="bubble">
          ${m.sender_role === "staff" ? '<div class="label">Support</div>' : ""}
          <div class="body">${esc(m.body)}</div>
          <div class="time">${new Date(m.created_at).toLocaleString()}</div>
        </div>
      </div>`).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Support — ${esc(thread.subject)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#111;padding:40px 24px}
  .header{max-width:680px;margin:0 auto 32px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
  .header h1{font-size:22px;font-weight:700;color:#1e293b}
  .header p{font-size:13px;color:#64748b;margin-top:6px}
  .logo{font-size:13px;font-weight:800;color:#4f46e5;margin-bottom:12px}
  .messages{max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
  .msg{display:flex}
  .msg.user{justify-content:flex-end}
  .msg.staff{justify-content:flex-start}
  .bubble{max-width:72%;padding:10px 14px;border-radius:18px;font-size:13px;line-height:1.5}
  .msg.user .bubble{background:#4f46e5;color:#fff;border-bottom-right-radius:4px}
  .msg.staff .bubble{background:#fff;color:#111;border:1px solid #e2e8f0;border-bottom-left-radius:4px}
  .label{font-size:10px;font-weight:700;color:#4f46e5;margin-bottom:4px}
  .msg.user .label{color:rgba(255,255,255,0.8)}
  .body{white-space:pre-wrap;word-break:break-word}
  .time{font-size:10px;margin-top:6px;opacity:0.55}
  .print-btn{display:block;max-width:680px;margin:0 auto 28px;padding:10px 24px;background:#4f46e5;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:fit-content}
  @media print{.print-btn{display:none!important}body{background:#fff;padding:24px}}
</style></head>
<body>
  <div class="header">
    <div class="logo">eFinMoney Support</div>
    <h1>${esc(thread.subject)}</h1>
    <p>Status: ${thread.status} &nbsp;·&nbsp; Exported ${new Date().toLocaleString()}</p>
  </div>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  <div class="messages">${rows}</div>
  <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 400); });<\/script>
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      // Popup blocked — download instead
      const a = document.createElement("a");
      a.href = url;
      a.download = `support-${thread.subject.slice(0, 40).replace(/\s+/g, "-")}.html`;
      a.click();
      toast.info("Open the downloaded file and press Ctrl+P to save as PDF");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Share conversation">
          <Share2 className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={shareEmail} className="gap-2">
          <Mail className="w-4 h-4 text-blue-500" /> Email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareWhatsApp} className="gap-2">
          {/* WhatsApp green icon via SVG */}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareSMS} className="gap-2">
          <Smartphone className="w-4 h-4 text-emerald-500" /> SMS
        </DropdownMenuItem>
        <DropdownMenuItem onClick={savePDF} className="gap-2">
          <FileText className="w-4 h-4 text-rose-500" /> Save as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
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

/* ── New conversation form ──────────────────────────────────────────────── */
function NewConversation({ onDone, onCancel }: { onDone: (id: string | null) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const create = useCreateThread();

  const submit = async () => {
    if (!subject.trim() || !body.trim()) return;
    try {
      const t = await create.mutateAsync({ subject: subject.trim(), body: body.trim(), files });
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
        <FilePicker files={files} onChange={setFiles} />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={create.isPending || !subject.trim() || !body.trim()} className="gap-2">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
          </Button>
        </div>
      </div>
    </AppPage>
  );
}

/* ── Conversation view ──────────────────────────────────────────────────── */
function Conversation({ thread, onBack }: { thread: SupportThread; onBack: () => void }) {
  const { data: messages = [] } = useThreadMessages(thread.id);
  const send = useSendMessage();
  const update = useUpdateThread();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thread.unread_for_user) update.mutate({ id: thread.id, patch: { unread_for_user: false } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const submit = useCallback(() => {
    if (!text.trim() && files.length === 0) return;
    const body = text.trim();
    const pendingFiles = files;
    setText("");
    setFiles([]);
    send.mutate(
      { threadId: thread.id, body, role: "user", files: pendingFiles },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }, [text, files, thread.id, send]);

  const closed = thread.status === "closed";

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(.support-print-area) { display: none !important; }
          .support-print-area { display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <AppPage width="narrow" className="py-6 support-print-area" innerClassName="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center gap-2 pb-4 border-b border-border no-print">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold truncate">{thread.subject}</h1>
            <p className="text-xs text-muted-foreground capitalize">{thread.status}</p>
          </div>
          <ShareButton thread={thread} messages={messages} />
        </div>

        {/* Print header (hidden on screen) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-xl font-bold">Support — {thread.subject}</h1>
          <p className="text-sm text-muted-foreground">Status: {thread.status} · {new Date(thread.last_message_at).toLocaleString()}</p>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.sender_role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                m.sender_role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {m.sender_role === "staff" && <div className="text-[10px] font-semibold text-primary mb-0.5">Support</div>}
                {m.body}
                {(m.attachments || []).length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {m.attachments.map((a, i) => <AttachmentItem key={i} a={a} />)}
                  </div>
                )}
                <div className={cn("text-[10px] mt-1", m.sender_role === "user" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {closed ? (
          <div className="text-center text-xs text-muted-foreground py-3 border-t border-border no-print">
            This conversation is closed. Start a new one if you need more help.
          </div>
        ) : (
          <div className="pt-3 border-t border-border space-y-2 no-print">
            <FilePicker files={files} onChange={setFiles} />
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-center gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your message…"
                disabled={send.isPending}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              />
              <Button type="submit" size="icon" disabled={send.isPending || (!text.trim() && files.length === 0)}>
                {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          </div>
        )}
      </AppPage>
    </>
  );
}

export default SupportPage;
